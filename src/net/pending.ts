/**
 * Optimistic requests that expire if the server never answers.
 *
 * Pure, so it can be tested outside the QuickJS sandbox.
 *
 * Every optimistic UI update in this scene needs this. The Multiplayer Server
 * silently DISCARDS messages sent while it cold-starts, and that boot takes
 * about fifteen seconds — the exact window a visitor arriving at a sleeping
 * world sits in. Without expiry, one lost message leaves the interface stuck in
 * a state the server never agreed to, for the rest of the session: a hand that
 * can never be answered, or a hand the player is told they left but did not.
 */
export class PendingRequests<K> {
  private readonly sentAt = new Map<K, number>()
  private readonly timeoutMs: number

  constructor(timeoutMs: number) {
    this.timeoutMs = timeoutMs
  }

  get size(): number {
    return this.sentAt.size
  }

  /** Records a request. Re-sending refreshes the deadline. */
  add(key: K, now: number): void {
    this.sentAt.set(key, now)
  }

  has(key: K): boolean {
    return this.sentAt.has(key)
  }

  /** The server answered; the request is no longer outstanding. */
  resolve(key: K): void {
    this.sentAt.delete(key)
  }

  clear(): void {
    this.sentAt.clear()
  }

  /**
   * Drops requests older than the timeout and returns their keys, so the caller
   * can roll back whatever it optimistically assumed.
   */
  expire(now: number): K[] {
    const dropped: K[] = []
    for (const [key, at] of this.sentAt) {
      if (now - at >= this.timeoutMs) {
        this.sentAt.delete(key)
        dropped.push(key)
      }
    }
    return dropped
  }
}
