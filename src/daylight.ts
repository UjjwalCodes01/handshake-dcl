/**
 * The scene's response to Decentraland's shared day/night cycle.
 *
 * Pure, so the curve can be executed and inspected rather than only imagined.
 *
 * Decentraland's `getWorldTime` is coordinated across players, which is what
 * makes this worth doing at all: everyone standing in the world sees the same
 * sky at the same moment. A local clock would give each visitor a private
 * timezone and quietly break the shared-place illusion.
 *
 * The design intent is inversion. In daylight the ground is legible and the
 * lattice is one bright object among many; at night the ground falls away and
 * the lattice becomes the only source of light in the scene — which is when a
 * structure built entirely out of other people's handshakes looks like what it
 * is.
 */

/** Seconds in one full Decentraland day. */
export const DAY_SECONDS = 86400

export type Mood = {
  /** Ground tint, 0..1 per channel. */
  ground: { r: number; g: number; b: number }
  /**
   * Multiplier applied to emissive surfaces. Above 1 at night, so the lattice
   * and anchor read as light sources rather than lit objects.
   */
  glow: number
  /** 0 = deep night, 1 = full day. Exposed for anything that wants the raw curve. */
  daylight: number
}

/** Normalises world seconds to 0..1 through the day. Noon is 0.5. */
export function dayPhase(seconds: number): number {
  if (!Number.isFinite(seconds)) return 0.5
  const wrapped = ((seconds % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS
  return wrapped / DAY_SECONDS
}

/**
 * Smooth 0..1 daylight curve: darkest around midnight, brightest at noon.
 *
 * A cosine rather than a step, so dawn and dusk are gradual — the transitions
 * are the part worth seeing, and a hard cut would read as a bug.
 */
export function daylightAt(phase: number): number {
  const clamped = Number.isFinite(phase) ? ((phase % 1) + 1) % 1 : 0.5
  // phase 0 = midnight -> 0, phase 0.5 = noon -> 1
  return (1 - Math.cos(clamped * Math.PI * 2)) / 2
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

const NIGHT_GROUND = { r: 0.04, g: 0.05, b: 0.09 }
const DAY_GROUND = { r: 0.28, g: 0.27, b: 0.31 }
/** Emissive multiplier at deep night and at full noon. */
const NIGHT_GLOW = 1.55
const DAY_GLOW = 0.75

export function moodFor(phase: number): Mood {
  const daylight = daylightAt(phase)
  return {
    ground: {
      r: mix(NIGHT_GROUND.r, DAY_GROUND.r, daylight),
      g: mix(NIGHT_GROUND.g, DAY_GROUND.g, daylight),
      b: mix(NIGHT_GROUND.b, DAY_GROUND.b, daylight)
    },
    glow: mix(NIGHT_GLOW, DAY_GLOW, daylight),
    daylight
  }
}

/**
 * Buckets the phase so materials are rewritten only when the mood visibly
 * changes.
 *
 * Writing a new colour every tick would be a continuous stream of component
 * updates for a change no eye can follow between frames — exactly the per-frame
 * mutation the whole scene is built to avoid.
 */
export function moodStep(phase: number, steps: number): number {
  if (steps <= 0) return 0
  const clamped = Number.isFinite(phase) ? ((phase % 1) + 1) % 1 : 0.5
  return Math.floor(clamped * steps) % steps
}
