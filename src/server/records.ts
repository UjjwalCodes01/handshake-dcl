/**
 * Pure ledger logic: validation, normalisation, slot selection, expiry.
 *
 * Deliberately free of SDK and Storage imports so it can be executed and tested
 * outside the QuickJS sandbox. This is the code that decides what survives a
 * server restart, and every failure mode here is silent — a rejected record does
 * not raise anything, it just quietly erases somebody's contribution.
 */

export type HandRecord = {
  owner: string
  ownerName: string
  /**
   * Captured when the hand is extended, because that is the only moment we can
   * observe it — by the time the hand is answered the owner is usually gone.
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

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function isHandRecord(value: unknown): boolean {
  if (!isObject(value)) return false
  return (
    typeof value.owner === 'string' &&
    value.owner.length > 0 &&
    typeof value.ownerName === 'string' &&
    typeof value.seed === 'number' &&
    typeof value.createdAt === 'number'
  )
}

export function isLinkRecord(value: unknown): boolean {
  if (!isObject(value)) return false
  return (
    typeof value.a === 'string' &&
    value.a.length > 0 &&
    typeof value.b === 'string' &&
    value.b.length > 0 &&
    typeof value.live === 'boolean' &&
    typeof value.seed === 'number' &&
    typeof value.createdAt === 'number'
  )
}

/**
 * Validates a stored hand and fills in fields added after it was written.
 *
 * Defaulting rather than discarding is the whole point: adding a field to the
 * schema must never wipe real history. Returns null only when the record is
 * genuinely unusable.
 */
export function normalizeHandRecord(value: unknown): HandRecord | null {
  if (!isHandRecord(value)) return null
  const v = value as Record<string, unknown>
  return {
    owner: v.owner as string,
    ownerName: v.ownerName as string,
    ownerIsGuest: typeof v.ownerIsGuest === 'boolean' ? v.ownerIsGuest : false,
    marked: typeof v.marked === 'boolean' ? v.marked : false,
    seed: v.seed as number,
    createdAt: v.createdAt as number
  }
}

export function normalizeLinkRecord(value: unknown): LinkRecord | null {
  if (!isLinkRecord(value)) return null
  const v = value as Record<string, unknown>
  return {
    a: v.a as string,
    b: v.b as string,
    aName: typeof v.aName === 'string' ? v.aName : '',
    bName: typeof v.bName === 'string' ? v.bName : '',
    live: v.live as boolean,
    seed: v.seed as number,
    createdAt: v.createdAt as number
  }
}

/**
 * Picks a slot for a new hand: a free one if there is any, otherwise the oldest.
 *
 * An earlier version had a separate branch preferring EXPIRED hands over live
 * ones. Mutation testing showed removing it changed nothing, and the reason is
 * arithmetic: an expired hand has `createdAt < now - ttlMs` while every live
 * hand has `createdAt >= now - ttlMs`, so the minimum `createdAt` is always an
 * expired hand whenever one exists. The branch could never change the outcome.
 *
 * It is gone rather than kept "for clarity", because logic that looks like it
 * protects something and does not is worse than no logic at all.
 *
 * The protection that DOES work is expiredHandSlots(), swept periodically by the
 * server: it frees aged-out slots so the free-slot path is taken instead of
 * evicting anyone. Taking the oldest live hand remains a genuine last resort,
 * accepted so the scene never refuses a visitor.
 *
 * Takes no clock or TTL, because it consults neither. A signature that accepted
 * them would imply this weighs expiry, and it does not.
 */
export function chooseHandSlot(hands: readonly (HandRecord | null)[]): number {
  if (hands.length === 0) return -1

  for (let i = 0; i < hands.length; i++) {
    if (hands[i] === null) return i
  }

  let oldest = 0
  let oldestAt = Number.MAX_SAFE_INTEGER
  for (let i = 0; i < hands.length; i++) {
    const at = hands[i]?.createdAt ?? 0
    if (at < oldestAt) {
      oldestAt = at
      oldest = i
    }
  }
  return oldest
}

/** Slots holding a hand that has aged out. */
export function expiredHandSlots(
  hands: readonly (HandRecord | null)[],
  now: number,
  ttlMs: number
): number[] {
  const out: number[] = []
  for (let i = 0; i < hands.length; i++) {
    const record = hands[i]
    if (!record) continue
    if (now - record.createdAt <= ttlMs) continue
    out.push(i)
  }
  return out
}

/**
 * Brings a persisted ring cursor back into range.
 *
 * A cursor outside the ring would index past the end of the slot array and
 * silently corrupt writes, so a corrupt or hand-edited value must be clamped
 * rather than trusted.
 */
export function clampCursor(value: unknown, size: number): number {
  if (size <= 0) return 0
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return ((Math.floor(value) % size) + size) % size
}

/** Order-independent key for a pair, matching net/address.ts. */
export function linkPairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/**
 * Validates a persisted "answered while away" map.
 *
 * It is keyed by wallet address and guests can present a new address each
 * session, so it is capped. Map preserves insertion order, which makes the
 * earliest keys the least recently created and therefore the right ones to drop.
 */
export function parseAnswered(value: unknown, cap: number): Map<string, number> {
  const out = new Map<string, number>()
  if (!isObject(value)) return out

  for (const [address, count] of Object.entries(value)) {
    if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) continue
    if (!address) continue
    out.set(address, Math.floor(count))
  }

  if (cap > 0 && out.size > cap) {
    let excess = out.size - cap
    for (const key of [...out.keys()]) {
      if (excess-- <= 0) break
      out.delete(key)
    }
  }
  return out
}
