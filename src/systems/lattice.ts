import { engine, Transform, MeshRenderer, Material, Entity, VisibilityComponent } from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { HandshakeLink, WorldStats } from '../components'
import { COLORS, LATTICE, SCENE } from '../config'
import { getLinkSlots, getStatsEntity } from '../entities/slots'
import { pairKey } from '../net/identity'
import { slotPlacement } from '../placement'
import { LINK_SLOT_COUNT } from '../sync-ids'

/**
 * What we last wrote to each slot's visual components.
 *
 * The first implementation called Material.setPbrMaterial and
 * VisibilityComponent.createOrReplace unconditionally on every tick, for every
 * active slot. At 5 Hz across 60 link slots plus 24 hand slots that is over 400
 * component writes per second doing nothing but rewriting identical values.
 * AGENTS.md §7 names exactly this — "do not mutate components every frame,
 * only write when a value actually changed" — as a primary cause of FPS
 * collapse on a phone. Writes are now diffed against this record.
 */
type Applied = { seed: number; live: boolean; visible: boolean }
const applied = new Map<Entity, Applied>()
let linkCount = 0
let totalHandshakes = 0

/**
 * Every handshake this world has ever recorded, not just the ones on screen.
 *
 * The lattice renders a bounded number of slots, so counting what is visible
 * would freeze the reported total at LINK_SLOT_COUNT — a world with a thousand
 * handshakes would claim sixty, forever.
 */
export function getTotalHandshakes(): number {
  return totalHandshakes
}

/**
 * Every pair that already has a link, rebuilt each tick from synced state.
 *
 * The server treats a linked pair as permanent, but the client only had a 20 s
 * cooldown. Past that the client would happily let two players offer again,
 * flash success, and then quietly receive an ALREADY_LINKED rejection — a tap
 * that looks like it worked and produces nothing. Mirroring server truth locally
 * means the button simply never offers an impossible handshake.
 */
const linkedPairs = new Set<string>()

/** World positions per slot, so reach tests skip the trigonometry each tick. */
const positions = new Map<number, Vector3.MutableVector3>()

/** Scratch vector for the player's eye point, reused every tick. */
const eyePoint = Vector3.create(0, 0, 0)

/**
 * The link the player is currently standing close enough to read.
 *
 * This is what gives a solo visitor something to do. The lattice stops being
 * decoration and becomes a browsable record of real people who were here — which
 * works with nobody else online, and without inventing anyone.
 */
export type LinkReading = {
  aName: string
  bName: string
  live: boolean
  createdAt: number
}

let nearestReading: LinkReading | null = null
let nearestSlot = -1

export function getLinkReading(): LinkReading | null {
  return nearestReading
}

export function isLinkedWith(self: string, other: string): boolean {
  if (!self || !other) return false
  return linkedPairs.has(pairKey(self, other))
}


function transformFor(slotIndex: number, seed: number): {
  position: Vector3.MutableVector3
  rotation: Quaternion.MutableQuaternion
} {
  const { angleDeg, height01 } = slotPlacement(slotIndex, LINK_SLOT_COUNT, seed)
  const radians = (angleDeg * Math.PI) / 180
  return {
    position: Vector3.create(
      SCENE.CENTRE.x + Math.cos(radians) * LATTICE.RADIUS_M,
      0.4 + height01 * LATTICE.HEIGHT_M,
      SCENE.CENTRE.z + Math.sin(radians) * LATTICE.RADIUS_M
    ),
    rotation: Quaternion.fromEulerDegrees(0, -angleDeg, 72)
  }
}

/**
 * Gives each active link slot a local visual.
 *
 * Visual components are created locally on every client and are deliberately NOT
 * synced. Placement is derived from the slot index plus the synced seed, so every
 * client arrives at an identical layout with no coordinate data on the wire.
 *
 * Slots are never destroyed — an emptied slot is hidden and reused. Repeated
 * entity creation and deletion is exactly the churn that degrades a long mobile
 * session.
 */
export function renderLattice(): void {
  const slots = getLinkSlots()
  if (slots.length === 0) return

  let active = 0
  linkedPairs.clear()

  const selfTransform = Transform.getOrNull(engine.PlayerEntity)
  // Raised to mid-torso: the player Transform is at their feet, and the lattice
  // climbs well above head height. See LATTICE.READ_EYE_OFFSET_M.
  // Written into a reused vector rather than allocating one every tick.
  let selfPos: Vector3.MutableVector3 | undefined
  if (selfTransform) {
    eyePoint.x = selfTransform.position.x
    eyePoint.y = selfTransform.position.y + LATTICE.READ_EYE_OFFSET_M
    eyePoint.z = selfTransform.position.z
    selfPos = eyePoint
  }
  let readSlot = -1
  let readReading: LinkReading | null = null
  let readDistSq = Number.MAX_VALUE
  const readSq = LATTICE.READ_RANGE_M * LATTICE.READ_RANGE_M
  const releaseSq = LATTICE.READ_RELEASE_M * LATTICE.READ_RELEASE_M

  for (let i = 0; i < slots.length; i++) {
    const entity = slots[i]
    const link = HandshakeLink.getOrNull(entity)
    // Slot data has not replicated yet. Nothing to draw, and nothing to reset.
    if (!link) continue

    const previous = applied.get(entity)

    if (!link.active) {
      if (previous && previous.visible) {
        VisibilityComponent.createOrReplace(entity, { visible: false })
        applied.set(entity, { ...previous, visible: false })
      }
      positions.delete(i)
      continue
    }

    active += 1
    if (link.a && link.b) linkedPairs.add(pairKey(link.a, link.b))

    // Reach test happens before the visual early-out below: a link whose
    // appearance has not changed still needs to be readable when walked up to.
    if (selfPos) {
      let position = positions.get(i)
      if (!position) {
        position = transformFor(i, link.seed).position
        positions.set(i, position)
      }
      const distSq = Vector3.distanceSquared(selfPos, position)
      // Hysteresis, so standing between two links does not strobe the readout.
      const threshold = i === nearestSlot ? releaseSq : readSq
      if (distSq <= threshold && distSq < readDistSq) {
        readDistSq = distSq
        readSlot = i
        readReading = {
          aName: link.aName,
          bName: link.bName,
          live: link.live,
          createdAt: link.createdAt
        }
      }
    }

    const unchanged = previous && previous.visible && previous.seed === link.seed && previous.live === link.live
    if (unchanged) continue

    const { position, rotation } = transformFor(i, link.seed)
    positions.set(i, position)
    const tint = link.live ? COLORS.LINK_FRESH : COLORS.LINK

    if (!previous) {
      Transform.createOrReplace(entity, {
        position,
        rotation,
        scale: Vector3.create(LATTICE.LINK_THICKNESS, 0.9, LATTICE.LINK_THICKNESS)
      })
      MeshRenderer.setBox(entity)
    } else if (previous.seed !== link.seed) {
      // A recycled slot now carries a different handshake, so its placement moves.
      const transform = Transform.getMutableOrNull(entity)
      if (transform) {
        transform.position = position
        transform.rotation = rotation
      }
    }

    if (!previous || previous.live !== link.live || previous.seed !== link.seed) {
      // Opaque and emissive. Blended transparency bypasses the renderer's
      // batching optimisations and is called out in AGENTS.md §7.
      Material.setPbrMaterial(entity, {
        albedoColor: Color4.create(tint.r, tint.g, tint.b, 1),
        emissiveColor: Color4.create(tint.r, tint.g, tint.b, 1),
        emissiveIntensity: link.live ? 2.2 : 1.6,
        roughness: 0.35
      })
    }

    if (!previous || !previous.visible) {
      VisibilityComponent.createOrReplace(entity, { visible: true })
    }

    applied.set(entity, { seed: link.seed, live: link.live, visible: true })
  }

  linkCount = active

  // Authoritative total from the server. Falling back to the rendered count
  // keeps the number honest in the moments before the stats slot syncs, and
  // never lets it report fewer links than are visibly on screen.
  const statsEntity = getStatsEntity()
  const stats = statsEntity === undefined ? null : WorldStats.getOrNull(statsEntity)
  totalHandshakes = Math.max(stats?.totalHandshakes ?? 0, active)

  nearestSlot = readSlot
  nearestReading = readReading
}

/** Test seam / teardown. */
export function resetLattice(): void {
  applied.clear()
  linkedPairs.clear()
  positions.clear()
  nearestReading = null
  nearestSlot = -1
  linkCount = 0
  totalHandshakes = 0
}
