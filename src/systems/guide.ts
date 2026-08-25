import { engine, Transform, MeshRenderer, Material, Entity, VisibilityComponent, Tween } from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { GUIDE } from '../config'
import { getYourCount, isConnected } from '../net/session'
import { getNearestAnswerablePosition } from './pendingHands'

/**
 * A wordless marker over the nearest hand a new player can answer.
 *
 * This is the entire onboarding. The scene has no text and no tutorial, which is
 * the right call for an international audience judged in ninety seconds — but a
 * first-timer still has to work out that walking somewhere is the move. A
 * floating mark is understood by anyone who has ever played anything, in any
 * language.
 *
 * It points ONLY at hands, never at the puzzle. The first thing a player learns
 * has to be the handshake; teaching them the single-player distraction first
 * would misrepresent the scene.
 *
 * It disappears permanently once they complete their first handshake. After that
 * they know, and a marker that never leaves is just clutter.
 */

let marker: Entity | undefined
let spinner: Entity | undefined
/** Last position written, so the Transform is touched only when the target moves. */
let appliedX = Number.NaN
let appliedZ = Number.NaN
let visible = false

function ensureMarker(): void {
  if (marker !== undefined) return

  marker = engine.addEntity()
  Transform.create(marker, { position: Vector3.create(0, -100, 0) })

  // Rotation lives on a CHILD, exactly as with the pending hands: a rotation
  // tween owns its entity's Transform, and this parent needs its position
  // rewritten whenever the target changes. Separating them means they can never
  // fight over the same component.
  spinner = engine.addEntity()
  Transform.create(spinner, {
    parent: marker,
    rotation: Quaternion.fromEulerDegrees(45, 0, 45),
    scale: Vector3.create(GUIDE.SIZE, GUIDE.SIZE, GUIDE.SIZE)
  })
  MeshRenderer.setBox(spinner)
  Material.setPbrMaterial(spinner, {
    albedoColor: Color4.create(GUIDE.TINT.r, GUIDE.TINT.g, GUIDE.TINT.b, 1),
    emissiveColor: Color4.create(GUIDE.TINT.r, GUIDE.TINT.g, GUIDE.TINT.b, 1),
    emissiveIntensity: 2.6,
    roughness: 0.3
  })
  // Engine-driven and infinite; costs scene code nothing per frame.
  Tween.setRotateContinuous(spinner, Quaternion.fromEulerDegrees(0, 1, 0), 60, 0)
  VisibilityComponent.createOrReplace(spinner, { visible: false })
}

function setVisible(next: boolean): void {
  if (next === visible) return
  visible = next
  if (spinner !== undefined) VisibilityComponent.createOrReplace(spinner, { visible: next })
}

/**
 * Positions the marker. Driven by the throttled tick, never per frame.
 */
export function updateGuide(): void {
  ensureMarker()
  if (marker === undefined) return

  // Only for players who have never completed a handshake HERE. Requires a
  // confirmed count, so a slow connection does not briefly flash the marker at
  // someone who is already a regular.
  const isNewcomer = isConnected() && getYourCount() === 0
  const target = isNewcomer ? getNearestAnswerablePosition() : undefined

  if (!target) {
    setVisible(false)
    return
  }

  if (target.x !== appliedX || target.z !== appliedZ) {
    appliedX = target.x
    appliedZ = target.z
    const transform = Transform.getMutableOrNull(marker)
    if (transform) {
      transform.position = Vector3.create(target.x, target.y + GUIDE.HEIGHT_OFFSET_M, target.z)
    }
  }

  setVisible(true)
}

/** Test seam / teardown. */
export function resetGuide(): void {
  appliedX = Number.NaN
  appliedZ = Number.NaN
  visible = false
}
