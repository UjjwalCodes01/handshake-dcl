import { HAND_SLOT_COUNT, LINK_SLOT_COUNT } from '../sync-ids'
import { HANDS, SERVER } from '../config'
import { loadAll, persist } from '../net/storage'

/**
 * The authoritative record of everything that has happened in this world.
 *
 * Lives in server memory and is flushed to durable Storage at checkpoints. The
 * storage service is explicitly not a live datastore, and the isolate caps
 * in-flight host calls at 40 shared across everything, so reading or writing it
 * on the gameplay path would be both slow and fragile.
 *
 * Every key is version-prefixed. The documented guidance for an incompatible
 * schema change is to write to a NEW key and ignore the old one, rather than
 * attempting a migration that can half-fail and leave unreadable state.
 */
const KEY_PREFIX = 'v1:'
const KEY_HANDS = 'v1:hands'
const KEY_LINKS = 'v1:links'
const KEY_STATS = 'v1:stats'
const KEY_ANSWERED = 'v1:answered'

export type HandRecord = {
  owner: string
  ownerName: string
  /**
   * Captured when the hand is extended, because that is the only moment we can
   * observe it — by the time the hand is answered the owner is usually gone and
   * PlayerIdentityData no longer covers them.
   */
  ownerIsGuest: boolean
  /** Cosmetic only; see net/protocol.ts. */
  marked: boolean
  seed: number
  createdAt: number
}

export type LinkRecord = {
  a: string
  b: string
  aName: string
  bName: string
  live: boolean
  seed: number
  createdAt: number
}

/** Slot-indexed. A null entry is a free slot. */
let hands: (HandRecord | null)[] = []
/** Ring buffer over the link slots; oldest is overwritten once full. */
let links: (LinkRecord | null)[] = []
let linkCursor = 0
let totalHandshakes = 0
/** address -> hands of theirs that were answered while they were away. */
let answered = new Map<string, number>()
/** Pairs that have already linked, so the same two people cannot farm links. */
const linkedPairs = new Set<string>()

/** address -> display name, learned at join. Not persisted; cheap to relearn. */
const displayNames = new Map<string, string>()

export function rememberDisplayName(address: string, name: string): void {
  if (!address) return
  // Bound both the count and the length: this is attacker-supplied text inside
  // a 256 MB isolate, and it is echoed to every other client via a synced
  // component whose messages are capped at ~13 KB.
  if (displayNames.size > 500 && !displayNames.has(address)) return
  displayNames.set(address, name.slice(0, 24))
}

export function getDisplayName(address: string): string {
  return displayNames.get(address) ?? ''
}

export function forgetDisplayName(address: string): void {
  displayNames.delete(address)
}

export function getHands(): readonly (HandRecord | null)[] {
  return hands
}
export function getLinks(): readonly (LinkRecord | null)[] {
  return links
}
export function getTotalHandshakes(): number {
  return totalHandshakes
}
export function hasLinkedPair(key: string): boolean {
  return linkedPairs.has(key)
}

/** Clears the "answered while away" counter once it has been delivered. */
export function consumeAnswered(address: string): number {
  const count = answered.get(address) ?? 0
  if (count > 0) {
    answered.delete(address)
    persist(KEY_ANSWERED, serialiseAnswered())
  }
  return count
}

/**
 * Records that one of `address`'s hands was answered while they were away.
 *
 * `persistable` is false for guests. A guest can present a different wallet
 * address every session, so their entry would never be collected and would sit
 * in persistent storage forever. They still get the credit in memory, so a
 * guest who is still connected sees it — it simply is not written to disk.
 */
export function creditAnswered(address: string, persistable: boolean): void {
  if (!address) return
  answered.set(address, (answered.get(address) ?? 0) + 1)
  if (!persistable) return
  evictAnsweredOverflow()
  persist(KEY_ANSWERED, serialiseAnswered())
}

/**
 * Drops the oldest entries once the cap is reached.
 *
 * Map preserves insertion order, so the first keys are the least recently
 * created. Losing an old unclaimed credit is a far better failure than growing
 * the persisted blob without limit inside a 256 MB isolate.
 */
function evictAnsweredOverflow(): void {
  if (answered.size <= SERVER.MAX_ANSWERED_ENTRIES) return
  const excess = answered.size - SERVER.MAX_ANSWERED_ENTRIES
  let removed = 0
  for (const key of answered.keys()) {
    if (removed >= excess) break
    answered.delete(key)
    removed += 1
  }
}

function serialiseAnswered(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [address, count] of answered) out[address] = count
  return out
}

export function findHandSlotOf(owner: string): number {
  for (let i = 0; i < hands.length; i++) {
    if (hands[i]?.owner === owner) return i
  }
  return -1
}

/**
 * Picks a slot for a new hand, in strict preference order:
 *   1. a free slot
 *   2. an EXPIRED hand (past HANDS.TTL_MS)
 *   3. the oldest live hand
 *
 * Step 2 is the important one. The first implementation went straight from 1 to
 * 3, so once the pool filled, every new visitor silently destroyed a living
 * hand — even when a fortnight-old one was sitting right beside it. Expired
 * hands are now consumed first, and step 3 remains only as a last resort so the
 * scene never refuses a visitor.
 */
export function allocateHandSlot(now: number): number {
  for (let i = 0; i < hands.length; i++) {
    if (hands[i] === null) return i
  }

  let oldestExpired = -1
  let oldestExpiredAt = Number.MAX_SAFE_INTEGER
  let oldest = 0
  let oldestAt = Number.MAX_SAFE_INTEGER

  for (let i = 0; i < hands.length; i++) {
    const at = hands[i]?.createdAt ?? 0
    if (now - at > HANDS.TTL_MS && at < oldestExpiredAt) {
      oldestExpiredAt = at
      oldestExpired = i
    }
    if (at < oldestAt) {
      oldestAt = at
      oldest = i
    }
  }

  return oldestExpired !== -1 ? oldestExpired : oldest
}

/**
 * Clears hands that have aged out. Returns the slots that changed so the caller
 * can republish them. Runs on a slow timer, never on the gameplay path.
 */
export function expireHands(now: number): number[] {
  const cleared: number[] = []
  for (let i = 0; i < hands.length; i++) {
    const record = hands[i]
    if (!record) continue
    if (now - record.createdAt <= HANDS.TTL_MS) continue
    hands[i] = null
    cleared.push(i)
  }
  if (cleared.length > 0) persist(KEY_HANDS, hands)
  return cleared
}

export function setHand(slot: number, record: HandRecord | null): void {
  if (slot < 0 || slot >= hands.length) return
  hands[slot] = record
  persist(KEY_HANDS, hands)
}

export function addLink(record: LinkRecord, pairKeyValue: string): number {
  const slot = linkCursor
  // Recycling this slot evicts whatever link was here. Drop its pair too, so the
  // in-memory set matches what a restart would rebuild from the surviving links
  // and cannot grow unbounded across a long-running session.
  const evicted = links[slot]
  if (evicted) {
    const key = evicted.a < evicted.b ? `${evicted.a}|${evicted.b}` : `${evicted.b}|${evicted.a}`
    if (key !== pairKeyValue) linkedPairs.delete(key)
  }
  links[slot] = record
  linkCursor = (linkCursor + 1) % LINK_SLOT_COUNT
  totalHandshakes += 1
  linkedPairs.add(pairKeyValue)
  persist(KEY_LINKS, links)
  persist(KEY_STATS, { total: totalHandshakes, cursor: linkCursor })
  return slot
}

/**
 * Loads persisted state, or starts clean.
 *
 * Every field is re-validated rather than trusted: a truncated write, a partial
 * rollout, or a hand-edited value via the storage CLI must not be able to crash
 * the isolate on boot and take the world down for everyone.
 */
export async function loadLedger(): Promise<void> {
  hands = new Array<HandRecord | null>(HAND_SLOT_COUNT).fill(null)
  links = new Array<LinkRecord | null>(LINK_SLOT_COUNT).fill(null)
  linkCursor = 0
  totalHandshakes = 0
  answered = new Map<string, number>()
  linkedPairs.clear()

  // One host call for the whole ledger. Missing keys are simply absent from the
  // result, which is the normal state of a world nobody has visited yet.
  const stored = await loadAll(KEY_PREFIX)

  const storedHands = stored.get(KEY_HANDS) ?? []
  if (Array.isArray(storedHands)) {
    for (let i = 0; i < Math.min(storedHands.length, HAND_SLOT_COUNT); i++) {
      const candidate = storedHands[i]
      if (!isHandRecord(candidate)) {
        hands[i] = null
        continue
      }
      // Tolerate records written before ownerIsGuest existed: default rather
      // than discard, so a schema addition never wipes real history.
      const partialHand = candidate as Partial<HandRecord>
      hands[i] = {
        ...candidate,
        ownerIsGuest: typeof partialHand.ownerIsGuest === 'boolean' ? partialHand.ownerIsGuest : false,
        marked: typeof partialHand.marked === 'boolean' ? partialHand.marked : false
      }
    }
  }

  const storedLinks = stored.get(KEY_LINKS) ?? []
  if (Array.isArray(storedLinks)) {
    for (let i = 0; i < Math.min(storedLinks.length, LINK_SLOT_COUNT); i++) {
      const candidate = storedLinks[i]
      if (isLinkRecord(candidate)) {
        const partial = candidate as Partial<LinkRecord>
        links[i] = {
          ...candidate,
          aName: typeof partial.aName === 'string' ? partial.aName : '',
          bName: typeof partial.bName === 'string' ? partial.bName : ''
        }
        linkedPairs.add(candidate.a < candidate.b ? `${candidate.a}|${candidate.b}` : `${candidate.b}|${candidate.a}`)
      }
    }
  }

  const stats = stored.get(KEY_STATS) ?? null
  if (stats && typeof stats === 'object') {
    const record = stats as Record<string, unknown>
    if (typeof record.total === 'number' && Number.isFinite(record.total) && record.total >= 0) {
      totalHandshakes = Math.floor(record.total)
    }
    if (typeof record.cursor === 'number' && Number.isFinite(record.cursor)) {
      // Clamp: a cursor outside the ring would silently corrupt slot writes.
      linkCursor = ((Math.floor(record.cursor) % LINK_SLOT_COUNT) + LINK_SLOT_COUNT) % LINK_SLOT_COUNT
    }
  }

  const storedAnswered = stored.get(KEY_ANSWERED) ?? null
  if (storedAnswered && typeof storedAnswered === 'object' && !Array.isArray(storedAnswered)) {
    for (const [address, count] of Object.entries(storedAnswered as Record<string, unknown>)) {
      if (typeof count === 'number' && Number.isFinite(count) && count > 0) {
        answered.set(address, Math.floor(count))
      }
    }
  }
}

function isHandRecord(value: unknown): value is HandRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    typeof record.owner === 'string' &&
    record.owner.length > 0 &&
    typeof record.ownerName === 'string' &&
    typeof record.seed === 'number' &&
    typeof record.createdAt === 'number'
  )
}

function isLinkRecord(value: unknown): value is LinkRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    typeof record.a === 'string' &&
    record.a.length > 0 &&
    typeof record.b === 'string' &&
    record.b.length > 0 &&
    typeof record.live === 'boolean' &&
    typeof record.seed === 'number' &&
    typeof record.createdAt === 'number'
  )
}
