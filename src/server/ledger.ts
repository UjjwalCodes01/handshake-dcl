import { HAND_SLOT_COUNT, LINK_SLOT_COUNT } from '../sync-ids'
import { HANDS, SERVER } from '../config'
import { loadAll, persist } from '../net/storage'
import { parseConnectors, recordConnection, serialiseConnectors, topConnectors } from './ranking'
import { NameTable } from './names'
import type { Connector } from './ranking'

export type { Connector } from './ranking'
import {
  chooseHandSlot,
  clampCursor,
  expiredHandSlots,
  linkPairKey,
  normalizeHandRecord,
  normalizeLinkRecord,
  parseAnswered
} from './records'
import type { HandRecord, LinkRecord } from './records'

export type { HandRecord, LinkRecord } from './records'

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
const KEY_CONNECTORS = 'v1:connectors'

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

/** Lifetime connection counts, persisted. See ./ranking for why it is bounded. */
let connectors = new Map<string, Connector>()

/** How many people this player has connected with, ever. */
export function getConnectionCount(address: string): number {
  return connectors.get(address)?.count ?? 0
}

export function getTopConnectors(limit: number): Connector[] {
  return topConnectors(connectors, limit)
}

/** Credits both participants of a completed handshake. */
export function creditConnection(a: string, aName: string, b: string, bName: string): void {
  recordConnection(connectors, a, aName, SERVER.MAX_CONNECTORS)
  recordConnection(connectors, b, bName, SERVER.MAX_CONNECTORS)
  persist(KEY_CONNECTORS, serialiseConnectors(connectors, SERVER.MAX_CONNECTORS))
}

/**
 * address -> display name, learned at join. Not persisted; cheap to relearn.
 * Bounded by EVICTION, not refusal — see ./names for why that distinction
 * decides whether a successful world keeps naming people.
 */
const displayNames = new NameTable(SERVER.MAX_DISPLAY_NAMES, SERVER.MAX_NAME_LENGTH)

export function rememberDisplayName(address: string, name: string): void {
  displayNames.remember(address, name)
}

export function getDisplayName(address: string): string {
  return displayNames.get(address)
}

export function forgetDisplayName(address: string): void {
  displayNames.forget(address)
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
// `now` is accepted for call-site symmetry with expireHands and to keep the
// server's intent readable; selection itself needs no clock. See records.ts.
export function allocateHandSlot(_now: number): number {
  return chooseHandSlot(hands)
}

/**
 * Clears hands that have aged out. Returns the slots that changed so the caller
 * can republish them. Runs on a slow timer, never on the gameplay path.
 */
export function expireHands(now: number): number[] {
  const cleared = expiredHandSlots(hands, now, HANDS.TTL_MS)
  for (const slot of cleared) hands[slot] = null
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
  connectors = new Map<string, Connector>()
  linkedPairs.clear()

  // One host call for the whole ledger. Missing keys are simply absent from the
  // result, which is the normal state of a world nobody has visited yet.
  const stored = await loadAll(KEY_PREFIX)

  const storedHands = stored.get(KEY_HANDS) ?? []
  if (Array.isArray(storedHands)) {
    for (let i = 0; i < Math.min(storedHands.length, HAND_SLOT_COUNT); i++) {
      hands[i] = normalizeHandRecord(storedHands[i])
    }
  }

  const storedLinks = stored.get(KEY_LINKS) ?? []
  if (Array.isArray(storedLinks)) {
    for (let i = 0; i < Math.min(storedLinks.length, LINK_SLOT_COUNT); i++) {
      const record = normalizeLinkRecord(storedLinks[i])
      if (!record) continue
      links[i] = record
      linkedPairs.add(linkPairKey(record.a, record.b))
    }
  }

  const stats = stored.get(KEY_STATS) ?? null
  if (stats && typeof stats === 'object') {
    const record = stats as Record<string, unknown>
    if (typeof record.total === 'number' && Number.isFinite(record.total) && record.total >= 0) {
      totalHandshakes = Math.floor(record.total)
    }
    // Clamp: a cursor outside the ring would silently corrupt slot writes.
    linkCursor = clampCursor(record.cursor, LINK_SLOT_COUNT)
  }

  answered = parseAnswered(stored.get(KEY_ANSWERED) ?? null, SERVER.MAX_ANSWERED_ENTRIES)
  connectors = parseConnectors(stored.get(KEY_CONNECTORS) ?? null, SERVER.MAX_CONNECTORS)
}


