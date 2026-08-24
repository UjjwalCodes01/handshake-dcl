import { pairKey } from '../net/address.ts'

/**
 * Server-side anti-cheat: rate limiting and two-sided handshake corroboration.
 *
 * Pure, so the logic that decides what a client is allowed to do can actually be
 * executed and tested. AGENTS.md §5 is blunt about this — never trust the
 * client — and a mistake here does not throw. It quietly lets someone forge a
 * handshake, or lets one player spend the whole world's storage budget.
 */

/**
 * Token-bucket limiter, per player.
 *
 * The transport already drops peers exceeding roughly 300 messages/second, but
 * that protects the TRANSPORT. This protects gameplay and, more importantly,
 * bounds how many durable Storage writes a single player can trigger — the
 * isolate allows only 40 in-flight host calls across everything.
 */
export class RateLimiter {
  private readonly seen = new Map<string, number[]>()
  private readonly maxActions: number
  private readonly windowMs: number

  constructor(maxActions: number, windowMs: number) {
    this.maxActions = maxActions
    this.windowMs = windowMs
  }

  /**
   * Records an attempt. Returns true if it should be REFUSED.
   *
   * A refused attempt is deliberately not recorded, so a player hammering the
   * server cannot extend their own lockout indefinitely — they simply stay at
   * the limit until their window rolls forward.
   */
  check(address: string, now: number): boolean {
    const recent = (this.seen.get(address) ?? []).filter((t) => now - t < this.windowMs)

    if (recent.length >= this.maxActions) {
      this.seen.set(address, recent)
      return true
    }

    recent.push(now)
    this.seen.set(address, recent)
    return false
  }

  /** Called when a player leaves, so their history does not linger. */
  forget(address: string): void {
    this.seen.delete(address)
  }

  get trackedPlayers(): number {
    return this.seen.size
  }
}

export type LiveClaim = { from: string; at: number }

/**
 * Requires BOTH participants to independently claim a live handshake.
 *
 * HandshakeIntent is peer-owned by design — that is what makes the tap feel
 * instant without a server round-trip. But it also means a modified client can
 * write an intent carrying somebody ELSE's address as owner, manufacturing the
 * appearance of mutual consent. Acting on a single report would let a cheater
 * force a handshake with any player who merely happens to be standing nearby.
 *
 * So a claim is held until the other side corroborates it. A forged intent
 * produces exactly one real claim and never completes; honest play produces two,
 * because both clients report independently.
 */
export class LiveClaims {
  private readonly claims = new Map<string, LiveClaim>()
  private readonly windowMs: number

  constructor(windowMs: number) {
    this.windowMs = windowMs
  }

  get size(): number {
    return this.claims.size
  }

  /**
   * Registers `sender`'s claim about `partner`.
   *
   * Returns the corroborating claim when the pair is now confirmed by two
   * DIFFERENT players inside the window, or null while still waiting.
   */
  claim(sender: string, partner: string, now: number): LiveClaim | null {
    const key = pairKey(sender, partner)
    const existing = this.claims.get(key)

    const corroborated =
      existing !== undefined &&
      existing.from !== sender && // a player cannot corroborate themselves
      now - existing.at <= this.windowMs

    if (corroborated) {
      this.claims.delete(key)
      return existing!
    }

    // First claim, a repeat from the same player, or a stale one. Record and wait.
    this.claims.set(key, { from: sender, at: now })
    return null
  }

  /** Drops stale one-sided claims so the map cannot grow across a long session. */
  prune(now: number): void {
    for (const [key, claim] of this.claims) {
      if (now - claim.at > this.windowMs) this.claims.delete(key)
    }
  }

  /**
   * Forgets a departing player's outstanding claims, so a returning player
   * cannot corroborate one minutes later.
   */
  forget(address: string): void {
    for (const [key, claim] of this.claims) {
      if (claim.from === address) this.claims.delete(key)
    }
  }
}
