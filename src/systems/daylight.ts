import { getWorldTime } from '~system/Runtime'
import { DAYLIGHT } from '../config'
import { dayPhase, moodFor, moodStep } from '../daylight'
import { applyDaylight } from '../entities/world'

/**
 * Drives the scene's day/night mood from Decentraland's shared world clock.
 *
 * `getWorldTime` is coordinated across players, which is the whole reason to use
 * it rather than the device clock: every visitor sees the same sky at the same
 * moment. A local clock would give each person a private timezone and quietly
 * break the illusion of a shared place.
 *
 * In daylight the ground is legible and the lattice is one bright object among
 * many. At night the ground falls away and the lattice becomes the only light in
 * the scene — which is when a structure built entirely from other people's
 * handshakes looks like what it actually is.
 */

let sincePoll = Number.MAX_VALUE
let inFlight = false
let appliedStep = -1

/** Last known phase, so a failed poll leaves the scene where it was. */
let phase = 0.5

export function getDayPhase(): number {
  return phase
}

function apply(): void {
  const step = moodStep(phase, DAYLIGHT.STEPS)
  if (step === appliedStep) return
  appliedStep = step

  const mood = moodFor(phase)
  applyDaylight(step, mood.ground, mood.glow)
}

/**
 * Polls the shared clock on a slow cadence. Called from the throttled tick.
 *
 * Deliberately does not await: a host call that stalls must never hold up the
 * simulation, and only one request is ever outstanding.
 */
export function daylightSystem(dt: number): void {
  sincePoll += dt
  if (sincePoll < DAYLIGHT.POLL_INTERVAL_S || inFlight) return
  sincePoll = 0
  inFlight = true

  void getWorldTime({})
    .then((response) => {
      phase = dayPhase(response.seconds)
      apply()
    })
    .catch(() => {
      // The clock is unavailable. Leave the scene at its last known mood rather
      // than snapping it to a default that may be wrong.
    })
    .then(() => {
      inFlight = false
    })
}

/** Test seam / teardown. */
export function resetDaylight(): void {
  sincePoll = Number.MAX_VALUE
  inFlight = false
  appliedStep = -1
  phase = 0.5
}
