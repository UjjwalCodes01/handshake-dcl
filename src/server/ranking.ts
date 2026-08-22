/**
 * The roll of most-connected visitors.
 *
 * Pure, so it can be executed and tested outside the sandbox.
 *
 * Deliberately ranks CONNECTIONS, not points or speed or wins. A scoreboard
 * that rewarded domination would fight the premise of the scene; one that
 * rewards meeting people rewards exactly what the scene is for. It is also the
 * only honest metric available — every entry is a handshake with a real person
 * who agreed to it.
 */

export type Connector = {
  address: string
  name: string
  count: number
}

/**
 * Records one more connection for a player.
 *
 * Everyone is recorded, always. An earlier version refused newcomers once the
 * table was full, which sounds like protecting established visitors but means a
 * player arriving at a mature world can never be tracked, and therefore can
 * never climb — the table freezes and the leaderboard stops meaning anything.
 *
 * Memory is bounded by pruning instead: the table may drift above `cap` while
 * people accumulate, and is trimmed back to the strongest `cap` entries once it
 * drifts well past. That matters because this is persisted, synced, and keyed by
 * wallet address — and guests can present a new address every session.
 */
export function recordConnection(
  table: Map<string, Connector>,
  address: string,
  name: string,
  cap: number
): void {
  if (!address) return

  const existing = table.get(address)
  if (existing) {
    existing.count += 1
    // Names can change between visits; keep the most recent non-empty one.
    if (name) existing.name = name
    return
  }

  table.set(address, { address, name, count: 1 })
  if (cap > 0 && table.size > cap * 2) pruneToTop(table, cap)
}

/** Trims the table to its strongest entries, dropping the weakest. */
export function pruneToTop(table: Map<string, Connector>, cap: number): void {
  if (cap <= 0 || table.size <= cap) return
  const keep = new Set(topConnectors(table, cap).map((c) => c.address))
  for (const address of [...table.keys()]) {
    if (!keep.has(address)) table.delete(address)
  }
}

/**
 * The top `limit` connectors, most connections first.
 *
 * Ties break on address so every client sorts identically — otherwise two
 * players standing at the anchor would see the same names in a different order,
 * which reads as a bug.
 */
export function topConnectors(table: Map<string, Connector>, limit: number): Connector[] {
  const all = [...table.values()]
  all.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return a.address < b.address ? -1 : a.address > b.address ? 1 : 0
  })
  return all.slice(0, Math.max(0, limit))
}

/** Validates a persisted table, discarding anything malformed. */
export function parseConnectors(value: unknown, cap: number): Map<string, Connector> {
  const out = new Map<string, Connector>()
  if (!Array.isArray(value)) return out

  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const entry = raw as Record<string, unknown>
    const address = typeof entry.address === 'string' ? entry.address : ''
    const count = typeof entry.count === 'number' && Number.isFinite(entry.count) ? Math.floor(entry.count) : 0
    if (!address || count <= 0) continue
    out.set(address, {
      address,
      name: typeof entry.name === 'string' ? entry.name.slice(0, 24) : '',
      count
    })
    if (out.size >= cap) break
  }
  return out
}

/** Serialises for persistence, keeping only the strongest entries. */
export function serialiseConnectors(table: Map<string, Connector>, cap: number): Connector[] {
  return topConnectors(table, cap)
}
