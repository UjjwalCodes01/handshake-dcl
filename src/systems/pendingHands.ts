import { engine, Transform, MeshRenderer, Material, Entity, VisibilityComponent, Tween } from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { PendingHand } from '../components'
import { COLORS, HANDS, SCENE } from '../config'
import { getHandSlots } from '../entities/slots'
import { getSelfAddress } from '../net/identity'
import { room } from '../net/protocol'
import { consumeMark } from './echoes'
import { slotPlacement } from '../placement'
import { HAND_SLOT_COUNT } from '../sync-ids'

/**
 * What we last wrote to each slot's visuals.
 *
 * Component writes are diffed against this. Rewriting identical values every
 * tick across 24 slots is exactly the per-frame mutation AGENTS.md §7 names as a
 * primary cause of FPS collapse on a phone.
 */
type Applied = { seed: number; visible: boolean; mine: boolean; reachable: boolean; marked: boolean }
const applied = new Map<Entity, Applied>()

/**
 * The spinning visual for each slot, as a CHILD of the slot entity.
 *
 * The spin is a Tween, which the engine owns and drives with no per-frame work
 * from scene code. But a rotation tween owns its entity's Transform, and we also
 * need to write position when a slot is recycled — so the two live on separate
 * entities. The parent holds position, the child holds rotation, and they can
 * never fight over the same component.
 *
 * Children are local-only visuals: they are never synced, and never destroyed.
 */
const spinners = new Map<Entity, Entity>()

/** Cached world positions, so reach tests do not recompute trigonometry per tick. */
const positions = new Map<number, Vector3.MutableVector3>()

let reachableSlot = -1
let pendingCount = 0
/** Display name of the hand within reach, surfaced by the HUD. */
let reachableOwnerName = ''
const inFlight = new Set<number>()

/**
 * Slot of the most recent completeHand request.
 *
 * The reply must unlock the slot that was REQUESTED, not whichever slot happens
 * to be reachable when it arrives — the player may have walked away in the
 * meantime, which would otherwise unlock the wrong slot and strand the real one.
 */
let lastRequestedSlot = -1

export function getLastRequestedSlot(): number {
  return lastRequestedSlot
}
export function getReachableSlot(): number {
  return reachableSlot
}
/** How many hands are currently waiting anywhere in the world. */
export function getPendingCount(): number {
  return pendingCount
}
export function getReachableOwnerName(): string {
  return reachableOwnerName
}
export function isSlotInFlight(slot: number): boolean {
  return inFlight.has(slot)
}
export function clearInFlight(slot: number): void {
  inFlight.delete(slot)
}
export function clearAllInFlight(): void {
  inFlight.clear()
}

/**
 * Ask the server to complete the pending hand within reach.
 *
 * The server is the only authority: it re-checks that the slot is occupied, that
 * the sender is not its owner, and that the pair has not already linked.
 */
export function completeReachableHand(): void {
  if (reachableSlot < 0) return
  if (inFlight.has(reachableSlot)) return
  inFlight.add(reachableSlot)
  lastRequestedSlot = reachableSlot
  room.send('completeHand', { slot: reachableSlot })
}

/**
 * Leave our own hand extended for whoever arrives next.
 *
 * Spends the echo-puzzle mark if one was earned this session, so solving the
 * puzzle leaves a permanent trace in the shared record rather than a score that
 * evaporates when the player walks away.
 */
export function extendHand(): void {
  room.send('extendHand', { marked: consumeMark() })
}

function positionFor(slotIndex: number, seed: number): Vector3.MutableVector3 {
  const { angleDeg } = slotPlacement(slotIndex, HAND_SLOT_COUNT, seed)
  const radians = (angleDeg * Math.PI) / 180
  return Vector3.create(
    SCENE.CENTRE.x + Math.cos(radians) * HANDS.RADIUS_M,
    HANDS.HEIGHT_M,
    SCENE.CENTRE.z + Math.sin(radians) * HANDS.RADIUS_M
  )
}

/**
 * Builds the child that carries the mesh and the spin. Called once per slot.
 *
 * Tilted on two axes so the spin actually reads as rotation — an axis-aligned
 * cube spinning about Y looks nearly static at a distance.
 */
function ensureSpinner(slot: Entity): Entity {
  const existing = spinners.get(slot)
  if (existing !== undefined) return existing

  const spinner = engine.addEntity()
  Transform.create(spinner, {
    parent: slot,
    rotation: Quaternion.fromEulerDegrees(35, 0, 35),
    scale: Vector3.create(1, 1, 1)
  })
  MeshRenderer.setBox(spinner)
  // Engine-driven, infinite (duration 0). Costs scene code nothing per frame.
  Tween.setRotateContinuous(spinner, Quaternion.fromEulerDegrees(0, 1, 0), HANDS.SPIN_DEG_PER_S, 0)
  spinners.set(slot, spinner)
  return spinner
}

/**
 * Renders every pending hand and works out which one is within reach.
 *
 * This is what makes the scene work for a player who arrives completely alone —
 * the case the risk register rates as CERTAIN during judging. The hands were
 * left by real previous visitors, so a solo player is still interacting with
 * people, just not simultaneously.
 *
 * Identity is deliberately NOT drawn in world space. TextShape renders at
 * different heights on mobile than on desktop (a known open parity bug), so a
 * floating nameplate would sit wrong on the exact platform that matters most.
 * The owner's name is surfaced through the 2D HUD instead.
 */
export function renderPendingHands(): void {
  const slots = getHandSlots()
  if (slots.length === 0) return

  const self = getSelfAddress()
  const selfTransform = Transform.getOrNull(engine.PlayerEntity)
  const selfPos = selfTransform ? selfTransform.position : undefined

  let nearest = -1
  let nearestName = ''
  let nearestDistSq = Number.MAX_VALUE
  let activeCount = 0

  const reachSq = HANDS.REACH_M * HANDS.REACH_M
  const releaseSq = HANDS.REACH_RELEASE_M * HANDS.REACH_RELEASE_M

  for (let i = 0; i < slots.length; i++) {
    const entity = slots[i]
    const hand = PendingHand.getOrNull(entity)
    if (!hand) continue

    const previous = applied.get(entity)

    if (!hand.active) {
      if (previous && previous.visible) {
        const spinner = spinners.get(entity)
        if (spinner !== undefined) VisibilityComponent.createOrReplace(spinner, { visible: false })
        applied.set(entity, { ...previous, visible: false })
      }
      // The hand is gone — we completed it, or someone else did. Either way the
      // optimistic lock must be released or the slot stays stuck forever.
      inFlight.delete(i)
      positions.delete(i)
      continue
    }

    activeCount += 1
    const mine = self !== '' && hand.owner === self

    let position = positions.get(i)
    if (!position || !previous || previous.seed !== hand.seed) {
      position = positionFor(i, hand.seed)
      positions.set(i, position)
    }

    // Reach is decided before drawing, so the highlight can be part of the same
    // change-detected write rather than a second pass.
    let reachable = false
    let distSq = Number.MAX_VALUE
    if (selfPos && self && !mine) {
      distSq = Vector3.distanceSquared(selfPos, position)
      // Hysteresis on the current target stops the button flickering when a
      // player stands right at the edge of reach.
      const threshold = i === reachableSlot ? releaseSq : reachSq
      reachable = distSq <= threshold
    }

    const spinner = ensureSpinner(entity)

    if (!previous) {
      Transform.createOrReplace(entity, { position, scale: Vector3.create(1, 1, 1) })
    } else if (previous.seed !== hand.seed) {
      const transform = Transform.getMutableOrNull(entity)
      if (transform) transform.position = position
    }

    if (!previous || previous.reachable !== reachable) {
      // Scale lives on the PARENT. The child's scale belongs to the spin tween's
      // entity and must not be touched from here.
      const transform = Transform.getMutableOrNull(entity)
      if (transform) {
        const size = HANDS.SIZE * (reachable ? HANDS.REACH_SCALE : 1)
        transform.scale = Vector3.create(size, size, size)
      }
    }

    if (!previous || previous.mine !== mine || previous.reachable !== reachable || previous.marked !== hand.marked) {
      // Your own waiting hand is dim, so the ones you can actually answer are
      // the ones that draw the eye. Reachable is brightest of all.
      // A marked hand was left by someone who solved the echoes. Same shape, so
      // it is never mistaken for a different kind of object — only brighter.
      const tint = mine ? COLORS.LINK : hand.marked ? COLORS.MARKED : COLORS.LINK_FRESH
      Material.setPbrMaterial(spinner, {
        albedoColor: Color4.create(tint.r, tint.g, tint.b, 1),
        emissiveColor: Color4.create(tint.r, tint.g, tint.b, 1),
        emissiveIntensity: mine ? 0.8 : reachable ? 3.0 : hand.marked ? 2.4 : 1.8,
        roughness: 0.4
      })
    }

    if (!previous || !previous.visible) {
      VisibilityComponent.createOrReplace(spinner, { visible: true })
    }

    applied.set(entity, { seed: hand.seed, visible: true, mine, reachable, marked: hand.marked })

    if (reachable && distSq < nearestDistSq) {
      nearestDistSq = distSq
      nearest = i
      nearestName = hand.ownerName
    }
  }

  reachableSlot = nearest
  reachableOwnerName = nearestName
  pendingCount = activeCount
}

/** Test seam / teardown. */
export function resetPendingHands(): void {
  applied.clear()
  positions.clear()
  inFlight.clear()
  reachableSlot = -1
  reachableOwnerName = ''
  pendingCount = 0
  lastRequestedSlot = -1
}
