/**
 * Deterministic placement for slot-based entities.
 *
 * Position is derived from the SLOT INDEX first and the server-assigned seed
 * only as jitter. Deriving it from the seed alone (as the first implementation
 * did) let two hands collide on the same angle — with 24 hands over 3600
 * possible angles that is roughly a 7% chance per world, and a collision makes
 * two hands overlap into one un-tappable lump.
 *
 * Index-based placement guarantees even separation, and has a second benefit:
 * a recycled slot keeps its position, so the lattice stays visually stable
 * instead of shuffling every time a link is replaced.
 */

export type Placement = { angleDeg: number; height01: number }

export function slotPlacement(index: number, total: number, seed: number): Placement {
  const safeTotal = total > 0 ? total : 1
  const base = (index / safeTotal) * 360
  // Jitter stays well inside the per-slot arc so neighbours cannot swap or touch.
  const arc = 360 / safeTotal
  const jitter = ((seed % 1000) / 1000 - 0.5) * arc * 0.5
  const angleDeg = (base + jitter + 360) % 360
  const height01 = ((seed >>> 3) % 1000) / 1000
  return { angleDeg, height01 }
}
