import { engine, Transform, PlayerIdentityData } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { HANDSHAKE } from '../config'
import { getSelfAddress, normalizeAddress } from '../net/identity'

export type NearbyPlayer = {
  address: string
  /** Mutable because the record is reused between ticks; never aliased to the engine's copy. */
  position: Vector3.MutableVector3
}

/**
 * Everyone currently in the scene except this client, keyed by lowercased address.
 *
 * Entries are REUSED between ticks rather than rebuilt. The previous version
 * cleared this map and allocated a fresh object and Vector3 for every player,
 * every tick — cost that grows with crowd size, which is exactly when the frame
 * budget is tightest. Now positions are written in place and only departures
 * cause a delete.
 */
const present = new Map<string, NearbyPlayer>()
/** Addresses seen this tick. Reused, so the scan itself allocates nothing. */
const seen = new Set<string>()

/** The single player we are currently offering to, or '' when nobody is close. */
let engaged = ''

const RANGE_SQ = HANDSHAKE.RANGE_M * HANDSHAKE.RANGE_M
const RELEASE_SQ = HANDSHAKE.RANGE_RELEASE_M * HANDSHAKE.RANGE_RELEASE_M

export function getEngagedAddress(): string {
  return engaged
}

export function isPresent(address: string): boolean {
  return present.has(address)
}

export function getPresentCount(): number {
  return present.size
}

/**
 * Rebuilds the roster of nearby players and picks who we are engaged with.
 *
 * Called from the throttled driver in systems/tick.ts, never per frame —
 * AGENTS.md §7 names per-frame work as a top cause of mobile FPS collapse, and
 * player positions do not need 60 Hz resolution for a 4 m proximity test.
 */
export function scanProximity(): void {
  const self = getSelfAddress()

  // Identity is not resolved yet; stay dormant rather than acting on bad data.
  if (!self) {
    present.clear()
    engaged = ''
    return
  }

  const selfTransform = Transform.getOrNull(engine.PlayerEntity)
  if (!selfTransform) {
    present.clear()
    engaged = ''
    return
  }
  const selfPos = selfTransform.position

  seen.clear()
  let bestAddress = ''
  let bestDistSq = Number.MAX_VALUE
  let engagedStillValid = false
  let engagedDistSq = Number.MAX_VALUE

  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData, Transform)) {
    const address = normalizeAddress(identity.address)

    // Skip ourselves. Comparing addresses rather than entity ids works whether
    // or not the local avatar is surfaced as a separate entity on this platform.
    if (!address || address === self) continue

    const transform = Transform.getOrNull(entity)
    if (!transform) continue

    // Copy into a reused record, never alias. Transform.getOrNull returns a live
    // view the engine keeps mutating, so retaining the reference would make this
    // roster silently change under any code that read it later in the tick.
    seen.add(address)
    const existing = present.get(address)
    if (existing) {
      existing.position.x = transform.position.x
      existing.position.y = transform.position.y
      existing.position.z = transform.position.z
    } else {
      present.set(address, {
        address,
        position: Vector3.create(transform.position.x, transform.position.y, transform.position.z)
      })
    }

    const distSq = Vector3.distanceSquared(selfPos, transform.position)

    if (address === engaged) {
      engagedStillValid = true
      engagedDistSq = distSq
    }
    if (distSq < bestDistSq) {
      bestDistSq = distSq
      bestAddress = address
    }
  }

  // Drop anyone who left. Only departures allocate/free, not the steady state.
  for (const [address] of present) {
    if (!seen.has(address)) present.delete(address)
  }

  // Hysteresis: hold onto the current partner until they pass the larger release
  // radius. Without this the button flickers on and off while someone stands at
  // the boundary, which reads as a broken scene on a phone.
  if (engagedStillValid && engagedDistSq <= RELEASE_SQ) return

  engaged = bestAddress !== '' && bestDistSq <= RANGE_SQ ? bestAddress : ''
}

/** Test seam / teardown. */
export function resetProximity(): void {
  present.clear()
  seen.clear()
  engaged = ''
}
