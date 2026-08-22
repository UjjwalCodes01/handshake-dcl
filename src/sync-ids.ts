/**
 * THE single source of synced entity enum IDs.
 *
 * AGENTS.md §5: every id must be unique and BELOW 8001. Creator Hub auto-assigns
 * Smart Item ids from 8001 upward, and a collision causes silent, wrong state sync.
 *
 * Which entities belong here, and which must NOT:
 *
 *  - Entities created identically on EVERY peer at scene start (including the
 *    Multiplayer Server, which runs the same scene code) MUST have a fixed id,
 *    so all peers agree they are the same entity.
 *  - Entities spawned dynamically in response to a player action must NOT have
 *    one — the runtime assigns a unique id, and hardcoding one would make two
 *    peers' independently-spawned entities collide.
 *
 * Everything in this scene is now slot-based and server-owned, so everything is
 * in the first category. Verified against docs: "Serverless Multiplayer →
 * About the enum id".
 */

/**
 * Pending-hand slots. A hand left behind by a visitor for a stranger to complete.
 *
 * Bounded on purpose: this is simultaneously the render budget, the sync budget,
 * and the persisted-payload budget. An unbounded ledger would eventually exceed
 * the ~13 KB message cap (which drops messages SILENTLY) and the server's 256 MB
 * isolate ceiling.
 */
/**
 * A single entity carrying world-wide totals.
 *
 * The lattice renders at most LINK_SLOT_COUNT links, so counting rendered slots
 * caps the visible total at 60 no matter how popular the world becomes. The real
 * figure has to travel separately, or a successful world reports the same number
 * forever.
 */
export const STATS_SLOT_ID = 1000

export const HAND_SLOT_BASE = 1100
export const HAND_SLOT_COUNT = 24

/**
 * Completed-link slots forming the lattice. Oldest is recycled once full, so the
 * entity count is bounded by construction rather than by discipline.
 */
export const LINK_SLOT_BASE = 1200
export const LINK_SLOT_COUNT = 60

export function handSlotId(index: number): number {
  return HAND_SLOT_BASE + index
}

export function linkSlotId(index: number): number {
  return LINK_SLOT_BASE + index
}

/**
 * Boot-time guard. Fails loudly rather than shipping the silent, near-untraceable
 * sync corruption described in AGENTS.md §12 #2.
 */
export function assertSyncIdsValid(): void {
  const seen = new Set<number>()

  const claim = (value: number, label: string): void => {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`[sync-ids] ${label}=${value} is not a valid entity id`)
    }
    if (value >= 8001) {
      throw new Error(`[sync-ids] ${label}=${value} is >= 8001 and will collide with Smart Items`)
    }
    if (seen.has(value)) {
      throw new Error(`[sync-ids] duplicate id ${value} (${label})`)
    }
    seen.add(value)
  }

  claim(STATS_SLOT_ID, 'STATS_SLOT')
  for (let i = 0; i < HAND_SLOT_COUNT; i++) claim(handSlotId(i), `HAND_SLOT[${i}]`)
  for (let i = 0; i < LINK_SLOT_COUNT; i++) claim(linkSlotId(i), `LINK_SLOT[${i}]`)
}
