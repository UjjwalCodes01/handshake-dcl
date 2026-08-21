/**
 * Scheduling for durable writes — which key to write, when, and when to give up.
 *
 * Deliberately free of SDK and Storage imports so it can be executed and tested
 * outside the QuickJS sandbox. The I/O lives in net/storage.ts; everything that
 * decides *whether data survives* lives here.
 *
 * This is the highest-consequence logic in the scene. `Storage.set()` never
 * throws — on failure it resolves to `false` — so a mistake in this file does
 * not crash anything. It silently stops persisting, and the world quietly
 * forgets everyone who ever visited while continuing to look perfectly healthy.
 */

export type QueueEntry = {
  key: string
  payload: string
  attempts: number
  /** Wall-clock time this entry may next be attempted. */
  readyAt: number
}

export type QueueOptions = {
  /** Minimum gap between writes of the same key. */
  debounceMs: number
  /** Bounded, so a permanently failing key cannot retry forever. */
  maxAttempts: number
  /** Backoff per attempt; the last value is reused once exhausted. */
  backoffMs: readonly number[]
}

export class WriteQueue {
  private readonly dirty = new Map<string, QueueEntry>()
  private readonly failed = new Set<string>()

  private readonly options: QueueOptions

  // Written out rather than using a constructor parameter property. Parameter
  // properties GENERATE code, and Node's TypeScript support is strip-only —
  // it removes types but never emits anything. Non-erasable syntax makes a
  // module unloadable at runtime, which is how this file failed its first test
  // run with "parameter property is not supported in strip-only mode".
  constructor(options: QueueOptions) {
    this.options = options
  }

  get size(): number {
    return this.dirty.size
  }

  /** Keys that exhausted every retry. Surfaced so failure is never invisible. */
  failedKeys(): string[] {
    return [...this.failed]
  }

  /**
   * When a key may next be attempted, or undefined if it is not queued.
   *
   * Read-only by design. `claimReady` deliberately mutates the schedule as it
   * hands entries out, so it cannot be used to ask "is this ready yet?" without
   * changing the answer.
   */
  nextAttemptAt(key: string): number | undefined {
    return this.dirty.get(key)?.readyAt
  }

  /** How many times the queued value for this key has failed. */
  attemptsFor(key: string): number {
    return this.dirty.get(key)?.attempts ?? 0
  }

  /**
   * Queue a value. Re-queuing the same key before it flushes coalesces to the
   * newest payload — only the latest state matters, and writing intermediate
   * values would spend host calls to persist data nobody will ever read.
   */
  enqueue(key: string, payload: string, now: number): void {
    const existing = this.dirty.get(key)
    this.dirty.set(key, {
      key,
      payload,
      // A superseded payload starts its attempt count over: the new value has
      // not failed yet, and inheriting failures could retire it early.
      attempts: 0,
      // But NOT the schedule. A key written repeatedly must not reset its own
      // backoff, or a hot key under a failing service would hammer it forever.
      readyAt: existing ? existing.readyAt : now + this.options.debounceMs
    })
    this.failed.delete(key)
  }

  /**
   * Entries due for a write, at most `capacity` of them.
   *
   * Claimed entries have their schedule pushed forward so the same key cannot be
   * started twice while a write is still in flight. Returns copies: the caller
   * awaits I/O, and the live entry may be superseded meanwhile.
   */
  claimReady(now: number, capacity: number): QueueEntry[] {
    const claimed: QueueEntry[] = []
    if (capacity <= 0) return claimed

    for (const entry of this.dirty.values()) {
      if (claimed.length >= capacity) break
      if (entry.readyAt > now) continue
      entry.readyAt = now + this.options.debounceMs
      claimed.push({ ...entry })
    }
    return claimed
  }

  /**
   * A write landed. The entry is cleared only if nothing newer arrived while it
   * was in flight — otherwise the newer value would be dropped unwritten.
   */
  onSuccess(entry: QueueEntry): void {
    const current = this.dirty.get(entry.key)
    if (current && current.payload === entry.payload) this.dirty.delete(entry.key)
  }

  /**
   * A write failed. Backs off, or gives up and records the key.
   *
   * Returns true if the key was retired, so the caller can log it loudly.
   */
  onFailure(entry: QueueEntry, now: number): boolean {
    const current = this.dirty.get(entry.key)
    // A newer value superseded this one; let that write proceed on its own
    // schedule rather than penalising it for an older payload's failure.
    if (!current || current.payload !== entry.payload) return false

    current.attempts += 1
    if (current.attempts >= this.options.maxAttempts) {
      this.dirty.delete(entry.key)
      this.failed.add(entry.key)
      return true
    }

    const backoff = this.options.backoffMs[
      Math.min(current.attempts, this.options.backoffMs.length - 1)
    ]
    current.readyAt = now + backoff
    return false
  }

  /**
   * Make everything immediately claimable, ignoring the debounce. Used at
   * checkpoints that matter — a player leaving, or the last one leaving, after
   * which the server shuts down and anything still queued is gone for good.
   */
  forceReady(now: number): void {
    for (const entry of this.dirty.values()) entry.readyAt = now
  }

  /** Test seam. */
  reset(): void {
    this.dirty.clear()
    this.failed.clear()
  }
}
