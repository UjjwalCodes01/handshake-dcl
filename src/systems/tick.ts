import { HANDSHAKE } from '../config'
import { scanProximity } from './proximity'
import { resolveHandshakes } from './handshake'
import { getTotalHandshakes, renderLattice } from './lattice'
import { renderPendingHands } from './pendingHands'
import { sessionTick } from '../net/session'
import { updateBeacon } from '../entities/world'
import { echoesSystem } from './echoes'
import { updateGuide } from './guide'

const INTERVAL = 1 / HANDSHAKE.SCAN_HZ
let accumulated = 0

/**
 * The client's only registered system.
 *
 * Everything runs on one throttled tick rather than several independent
 * per-frame systems. Two reasons, both from AGENTS.md §7:
 *
 *  1. Per-frame component reads and writes are the documented top cause of FPS
 *     collapse on a phone. None of this needs 60 Hz — proximity, offer
 *     resolution, hand reach and lattice placement are all fine at 5 Hz.
 *  2. Ordering is guaranteed. Proximity must refresh the presence roster BEFORE
 *     handshake resolution consults it. Separate systems would leave that to
 *     registration order, which is a fragile thing to depend on.
 *
 * dt is accumulated rather than compared, so a long frame cannot silently skip
 * a tick, and the true elapsed time is forwarded to anything that needs it.
 */
export function tickSystem(dt: number): void {
  accumulated += dt
  if (accumulated < INTERVAL) return
  const elapsed = accumulated
  accumulated = 0

  sessionTick(elapsed)
  scanProximity()
  resolveHandshakes()
  renderPendingHands()
  renderLattice()
  updateBeacon(getTotalHandshakes())
  echoesSystem(elapsed)
  // After pendingHands, which computes the target it points at.
  updateGuide()
}
