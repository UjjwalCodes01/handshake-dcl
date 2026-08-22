import { pairKey } from '../net/address.ts'

/**
 * Tracking for live handshake offers and pair cooldowns.
 *
 * Pure, so the scene's central mechanic can actually be executed and tested
 * rather than only reasoned about. Everything here decides whether a handshake
 * happens at all, and every failure mode is quiet: the offer simply never
 * completes, or completes when it should not have.
 */

export type RemoteOffer = {
  seq: number
  target: string
  /**
   * LOCAL clock time at which we witnessed this offer being made. Zero means
   * "seen, but we never saw it appear" — which never counts as fresh.
   */
  observedAt: number
}

/**
 * What every peer is currently offering, as far as we can tell.
 *
 * The design constraint that shapes this: two phones have no shared clock and
 * routinely differ by seconds, so a remote timestamp cannot be compared against
 * ours. Instead we watch each peer's own sequence counter to detect that a NEW
 * offer was made, then measure its age against OUR clock from the moment we saw
 * the change. Remote timestamps are never trusted, and never used.
 */
export class OfferTracker {
  private readonly offers = new Map<string, RemoteOffer>()
  private readonly windowMs: number

  constructor(windowMs: number) {
    this.windowMs = windowMs
  }

  get size(): number {
    return this.offers.size
  }

  /**
   * Records what a peer is currently offering.
   *
   * A FIRST sighting is deliberately recorded as not-fresh. We have no idea how
   * old it is — the player may have tapped a minute before we arrived — and
   * treating it as fresh would let a stale, "sticky" offer complete a handshake
   * without that person consenting at this moment, which breaks the entire
   * premise of mutual confirmation.
   */
  observe(owner: string, seq: number, target: string, now: number): void {
    const previous = this.offers.get(owner)
    if (previous === undefined) {
      this.offers.set(owner, { seq, target, observedAt: 0 })
      return
    }
    if (previous.seq !== seq) {
      // We WITNESSED the transition, so we know it was made just now.
      this.offers.set(owner, { seq, target, observedAt: now })
    }
  }

  /** True when a live offer from `owner` is currently aimed at `self`. */
  hasIncomingOffer(owner: string, self: string, now: number): boolean {
    if (!self) return false
    const offer = this.offers.get(owner)
    if (!offer) return false
    if (offer.observedAt === 0) return false
    if (offer.target !== self) return false
    return now - offer.observedAt <= this.windowMs
  }

  /**
   * Drops offers from players who have left, so a departed player's stale offer
   * can never complete a handshake with nobody.
   */
  prune(isPresent: (address: string) => boolean): void {
    for (const [address] of this.offers) {
      if (!isPresent(address)) this.offers.delete(address)
    }
  }

  forget(owner: string): void {
    this.offers.delete(owner)
  }

  clear(): void {
    this.offers.clear()
  }
}

/**
 * Pairs that recently shook hands, so neither side immediately re-offers while
 * the link is still replicating.
 */
export class PairCooldowns {
  private readonly recent = new Map<string, number>()
  private readonly cooldownMs: number

  constructor(cooldownMs: number) {
    this.cooldownMs = cooldownMs
  }

  get size(): number {
    return this.recent.size
  }

  record(a: string, b: string, now: number): void {
    this.recent.set(pairKey(a, b), now)
  }

  isOnCooldown(a: string, b: string, now: number): boolean {
    const last = this.recent.get(pairKey(a, b))
    if (last === undefined) return false
    return now - last < this.cooldownMs
  }

  /**
   * Drops expired entries.
   *
   * Without this the map keeps one entry per pair for the whole session. A busy
   * world would accumulate them indefinitely, inside a memory budget that is
   * already tight on a low-end phone.
   */
  prune(now: number): void {
    for (const [key, at] of this.recent) {
      if (now - at >= this.cooldownMs) this.recent.delete(key)
    }
  }

  clear(): void {
    this.recent.clear()
  }
}
