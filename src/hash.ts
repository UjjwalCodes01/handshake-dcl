/**
 * Stable 32-bit FNV-1a hash.
 *
 * Used to derive placement from identity alone, so every peer positions the same
 * link in the same place with zero coordinate data on the wire and no dependence
 * on comparable clocks. Must stay byte-identical across client and server —
 * do not "optimise" this without changing the storage schema version.
 */
export function hashString(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0
  }
  return hash >>> 0
}
