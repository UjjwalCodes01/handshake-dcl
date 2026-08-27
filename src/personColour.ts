import { hashString } from './hash.ts'

/**
 * A colour for every person, derived from their address alone.
 *
 * The lattice is a record of many different people, and until now every link in
 * it looked identical — a structure built by fifty strangers was
 * indistinguishable from one built by the same pair fifty times. Giving each
 * person a hue makes the diversity of contributors something you can see rather
 * than something you have to be told.
 *
 * Derived, never stored: the same address always yields the same colour, on
 * every client, with nothing on the wire and nothing to persist.
 */

export type Rgb = { r: number; g: number; b: number }

/**
 * Hue only. Saturation and lightness are fixed high, because these colours are
 * shown as EMISSIVE material against a near-black ground — a dark or washed-out
 * hue would read as unlit geometry rather than as somebody's mark, and at night
 * it would disappear entirely.
 */
const SATURATION = 0.62
/**
 * Lightness varies within a narrow band rather than being fixed.
 *
 * Hue alone is one-dimensional, and two addresses hashing a few buckets apart
 * produce colours no eye can tell apart — which in a scene about distinguishing
 * people is the one failure that matters. A second axis, taken from a different
 * part of the hash, makes near-collisions far less likely without letting
 * anything get dark enough to disappear against the ground at night.
 */
const LIGHT_MIN = 0.52
const LIGHT_MAX = 0.74

function hueToRgb(p: number, q: number, t: number): number {
  let x = t
  if (x < 0) x += 1
  if (x > 1) x -= 1
  if (x < 1 / 6) return p + (q - p) * 6 * x
  if (x < 1 / 2) return q
  if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
  return p
}

/** HSL to RGB, with saturation and lightness fixed by the constants above. */
export function hueColour(hue: number, lightness = (LIGHT_MIN + LIGHT_MAX) / 2): Rgb {
  const h = ((hue % 1) + 1) % 1
  const l = Math.min(LIGHT_MAX, Math.max(LIGHT_MIN, lightness))
  const q = l < 0.5 ? l * (1 + SATURATION) : l + SATURATION - l * SATURATION
  const p = 2 * l - q
  return {
    r: hueToRgb(p, q, h + 1 / 3),
    g: hueToRgb(p, q, h),
    b: hueToRgb(p, q, h - 1 / 3)
  }
}

/**
 * This person's colour.
 *
 * An empty address returns a neutral rather than hue 0 — an unknown participant
 * should read as unremarkable, not as a specific person who happens to be red.
 */
export function personColour(address: string): Rgb {
  if (!address) return { r: 0.55, g: 0.58, b: 0.62 }
  // Two SEPARATE hashes rather than two slices of one. Slices of a single hash
  // stay correlated, so two addresses landing near each other in hue also landed
  // near each other in lightness, and the second axis bought almost nothing.
  const hue = (hashString(address) % 3600) / 3600
  const lightness =
    LIGHT_MIN + ((hashString(`${address}|lightness`) % 1000) / 1000) * (LIGHT_MAX - LIGHT_MIN)
  return hueColour(hue, lightness)
}

/**
 * The colour of a link: the two participants, mixed.
 *
 * Order-independent, because a handshake is not something one person does to
 * another — the same pair must produce the same colour whichever way round the
 * link happens to be stored.
 */
export function blendColours(a: Rgb, b: Rgb): Rgb {
  return { r: (a.r + b.r) / 2, g: (a.g + b.g) / 2, b: (a.b + b.b) / 2 }
}

/**
 * Shifts a colour toward white.
 *
 * Used for the mark earned by solving the echoes. Brightening rather than
 * recolouring means the mark reads as "this one is special" while the hue still
 * says WHO left it — the identity is the part worth protecting.
 */
export function lighten(colour: Rgb, amount: number): Rgb {
  const t = Math.min(1, Math.max(0, amount))
  return {
    r: colour.r + (1 - colour.r) * t,
    g: colour.g + (1 - colour.g) * t,
    b: colour.b + (1 - colour.b) * t
  }
}

/** Convenience: the colour of a handshake between two addresses. */
export function linkColour(a: string, b: string): Rgb {
  return blendColours(personColour(a), personColour(b))
}
