import { Storage } from '@dcl/sdk/server'
import { isServer } from '@dcl/sdk/network'
import { WriteQueue } from './writeQueue'
import type { QueueEntry } from './writeQueue'

/**
 * Durable persistence, wrapped so it cannot silently lose data.
 *
 * Three properties of the underlying service make naive use dangerous:
 *
 *  1. `Storage.set()` NEVER THROWS. On failure it logs and resolves to `false`.
 *     A discarded boolean is a lost save that looks exactly like a successful
 *     one. Every write here is checked and retried.
 *  2. The isolate allows only **40 in-flight host calls**, shared across Storage,
 *     signedFetch and every other runtime API. Excess calls REJECT IMMEDIATELY —
 *     they are not queued. So we run at most MAX_CONCURRENT writes ourselves and
 *     queue the rest in-process.
 *  3. It is durable storage, not a live datastore. Writing per change would burn
 *     the host-call budget and add latency to gameplay. Working state stays in
 *     server memory; we flush dirty keys on a debounce.
 *
 * Retries are driven by the scene tick rather than timers, because the isolate
 * kills any async turn that takes longer than 60 s to settle, and long timer
 * chains are exactly how that happens.
 */

/** Well under the 40-call isolate-wide cap, leaving headroom for everything else. */
const MAX_CONCURRENT = 4
/** Minimum gap between writes of the same key. */
const DEBOUNCE_MS = 5000
/** Bounded so a permanently failing key cannot retry forever. */
const MAX_ATTEMPTS = 5
const BACKOFF_MS = [0, 1000, 3000, 8000, 20000]

const queue = new WriteQueue({
  debounceMs: DEBOUNCE_MS,
  maxAttempts: MAX_ATTEMPTS,
  backoffMs: BACKOFF_MS
})

let inFlight = 0

export function getFailedKeys(): string[] {
  return queue.failedKeys()
}

/**
 * Queue a value for persistence. Returns immediately; the write happens on a
 * later tick. Re-queuing the same key before it flushes coalesces to the latest
 * value, which is what we want — only the newest state matters.
 */
export function persist(key: string, value: unknown): void {
  if (!isServer()) return

  let payload: string
  try {
    // Storage accepts strings only.
    payload = JSON.stringify(value)
  } catch (error) {
    console.error(`[storage] could not serialise "${key}"`, error)
    return
  }

  queue.enqueue(key, payload, Date.now())
}

/**
 * Reads every persisted value under a prefix in ONE host call.
 *
 * The obvious implementation — one `Storage.get()` per key — is worse in three
 * ways on a fresh world, where none of the keys exist yet:
 *
 *  1. Each missing key produces a loud red 404 in the scene logs. Four of them
 *     on every cold boot looks exactly like a broken scene, and it buries any
 *     error that actually matters.
 *  2. It spends one of the isolate's 40 in-flight host calls per key, for
 *     nothing. `getValues` spends one total.
 *  3. It is slower during the ~15 s cold start, which is the window a judge is
 *     most likely to be sitting in.
 *
 * `getValues` simply omits keys that do not exist, so absence is normal rather
 * than exceptional. Values that cannot be parsed are skipped, never thrown: a
 * truncated or hand-edited record must not take the isolate down on boot and
 * with it the world for everyone.
 */
export async function loadAll(prefix: string): Promise<Map<string, unknown>> {
  const out = new Map<string, unknown>()
  if (!isServer()) return out

  try {
    const result = await Storage.getValues({ prefix })
    if (!result || !Array.isArray(result.data)) return out

    for (const entry of result.data) {
      if (!entry || typeof entry.key !== 'string') continue
      try {
        // Storage round-trips strings; anything else is stored as-is.
        out.set(entry.key, typeof entry.value === 'string' ? JSON.parse(entry.value) : entry.value)
      } catch {
        console.error(`[storage] unreadable value at "${entry.key}", ignoring it`)
      }
    }
  } catch (error) {
    console.error(`[storage] could not list values under "${prefix}"; starting empty`, error)
  }

  return out
}

async function writeOne(entry: QueueEntry): Promise<void> {
  inFlight += 1
  try {
    const ok = await Storage.set(entry.key, entry.payload)
    if (ok) {
      queue.onSuccess(entry)
      return
    }
    retire(entry)
  } catch (error) {
    // Documented as non-throwing, but a runtime-level rejection (for example the
    // concurrent-host-call cap) can still surface here. Treat it as a failed write.
    console.error(`[storage] write rejected for "${entry.key}"`, error)
    retire(entry)
  } finally {
    inFlight -= 1
  }
}

function retire(entry: QueueEntry): void {
  if (queue.onFailure(entry, Date.now())) {
    console.error(`[storage] GAVE UP on "${entry.key}" after ${MAX_ATTEMPTS} attempts — data not persisted`)
  }
}

/**
 * Drives queued writes. Called from the server tick, never per frame.
 * Deliberately does not await: it starts at most MAX_CONCURRENT writes and
 * returns, so a slow storage round-trip can never stall the simulation or push
 * an async turn past the isolate's 60 s settle limit.
 */
export function flushStorage(): void {
  if (!isServer()) return
  if (queue.size === 0) return

  for (const entry of queue.claimReady(Date.now(), MAX_CONCURRENT - inFlight)) {
    void writeOne(entry)
  }
}

/**
 * Force everything out now, ignoring the debounce. Used at checkpoints that
 * matter — a player leaving, or the last player leaving the scene.
 */
export function flushNow(): void {
  if (!isServer()) return
  queue.forceReady(Date.now())
  flushStorage()
}
