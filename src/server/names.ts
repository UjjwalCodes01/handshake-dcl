/**
 * Display names, bounded by eviction rather than refusal.
 *
 * Pure, so it can be executed and tested outside the sandbox.
 *
 * The distinction matters more than it looks. An earlier version REFUSED new
 * entries once full, which bounds memory but means that after N unique visitors
 * nobody new is ever named again — hands and links would quietly start showing
 * as anonymous, and only in a world successful enough to have had N visitors.
 * A slow failure that arrives exactly when the scene is doing well is the worst
 * kind, because nothing about it looks like a bug.
 *
 * Evicting the least recently seen keeps memory bounded AND keeps the names
 * that are actually in use.
 */
export class NameTable {
  private readonly names = new Map<string, string>()
  private readonly cap: number
  private readonly maxLength: number

  constructor(cap: number, maxLength: number) {
    this.cap = cap
    this.maxLength = maxLength
  }

  get size(): number {
    return this.names.size
  }

  /**
   * Records a name, evicting the least recently seen if full.
   *
   * Map preserves insertion order, so deleting before setting moves an existing
   * entry to the back — making iteration order a least-recently-seen ordering.
   */
  remember(address: string, name: string): void {
    if (!address) return
    // Attacker-supplied text, echoed to every other client via a synced
    // component. Truncate before it is stored, not at the point of display.
    const trimmed = name.slice(0, this.maxLength)

    // An empty name must never overwrite a known one — guests and unresolved
    // profiles report '', and losing a name to that makes a person anonymous.
    if (!trimmed && this.names.has(address)) {
      this.touch(address)
      return
    }

    this.names.delete(address)
    this.names.set(address, trimmed)

    while (this.names.size > this.cap) {
      const oldest = this.names.keys().next()
      if (oldest.done) break
      this.names.delete(oldest.value)
    }
  }

  get(address: string): string {
    return this.names.get(address) ?? ''
  }

  /** Marks an address as recently seen without changing its name. */
  private touch(address: string): void {
    const current = this.names.get(address)
    if (current === undefined) return
    this.names.delete(address)
    this.names.set(address, current)
  }

  forget(address: string): void {
    this.names.delete(address)
  }
}
