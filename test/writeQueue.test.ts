import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WriteQueue } from '../src/net/writeQueue.ts'

const OPTS = { debounceMs: 5000, maxAttempts: 5, backoffMs: [0, 1000, 3000, 8000, 20000] }
const T0 = 1_800_000_000_000

const q = () => new WriteQueue(OPTS)

test('a fresh write is not attempted immediately', () => {
  // Storage is durable persistence, not a live datastore. Writing on every
  // change would burn the isolate's host-call budget for no benefit.
  const w = q()
  w.enqueue('k', 'v1', T0)
  assert.equal(w.claimReady(T0, 4).length, 0, 'wrote before the debounce elapsed')
  assert.equal(w.claimReady(T0 + OPTS.debounceMs, 4).length, 1)
})

test('repeat writes coalesce to the newest payload', () => {
  const w = q()
  w.enqueue('k', 'v1', T0)
  w.enqueue('k', 'v2', T0 + 10)
  w.enqueue('k', 'v3', T0 + 20)
  assert.equal(w.size, 1, 'each write queued separately')
  const [entry] = w.claimReady(T0 + OPTS.debounceMs, 4)
  assert.equal(entry.payload, 'v3', 'an intermediate value would have been written')
})

test('a hot key cannot reset its own backoff', () => {
  // Otherwise a key written every tick against a failing service would retry
  // continuously and never actually back off.
  const w = q()
  w.enqueue('k', 'v1', T0)
  const first = w.claimReady(T0 + OPTS.debounceMs, 4)[0]
  w.onFailure(first, T0 + OPTS.debounceMs)

  w.enqueue('k', 'v2', T0 + OPTS.debounceMs + 1)
  // Still inside the backoff window, so nothing should be claimable yet.
  assert.equal(w.claimReady(T0 + OPTS.debounceMs + 2, 4).length, 0)
})

test('backoff lengthens with each failure', () => {
  // Measured with nextAttemptAt, not claimReady: claiming mutates the schedule,
  // so probing with it would change the value being measured.
  const w = q()
  w.enqueue('k', 'v', T0)
  let now = T0 + OPTS.debounceMs
  const waits: number[] = []

  for (let attempt = 1; attempt <= 3; attempt++) {
    const [entry] = w.claimReady(now, 4)
    assert.ok(entry, `nothing claimable on attempt ${attempt}`)
    w.onFailure(entry, now)

    const readyAt = w.nextAttemptAt('k')
    assert.ok(readyAt !== undefined, 'entry vanished before exhausting its attempts')
    waits.push(readyAt! - now)
    assert.equal(w.attemptsFor('k'), attempt)
    now = readyAt!
  }

  assert.deepEqual(
    waits,
    [OPTS.backoffMs[1], OPTS.backoffMs[2], OPTS.backoffMs[3]],
    `unexpected backoff progression: ${waits.join(', ')}`
  )
})

test('a permanently failing key is retired and reported', () => {
  // The alternative is retrying forever, which spends host calls indefinitely
  // and never tells anyone the data is being lost.
  const w = q()
  w.enqueue('k', 'v', T0)
  let now = T0 + OPTS.debounceMs
  let retired = false

  for (let i = 0; i < OPTS.maxAttempts + 2 && !retired; i++) {
    const [entry] = w.claimReady(now, 4)
    if (!entry) { now += 30_000; continue }
    retired = w.onFailure(entry, now)
    now += 30_000
  }

  assert.ok(retired, 'never gave up')
  assert.equal(w.size, 0, 'retired key left in the queue')
  assert.deepEqual(w.failedKeys(), ['k'], 'failure was not surfaced')
})

test('re-queuing a retired key clears its failed mark', () => {
  const w = q()
  w.enqueue('k', 'v', T0)
  let now = T0 + OPTS.debounceMs
  for (let i = 0; i < OPTS.maxAttempts + 2; i++) {
    const [e] = w.claimReady(now, 4)
    if (e) w.onFailure(e, now)
    now += 30_000
  }
  assert.deepEqual(w.failedKeys(), ['k'])

  w.enqueue('k', 'v2', now)
  assert.deepEqual(w.failedKeys(), [], 'a recovered key still reported as failed')
})

test('a late success for a superseded payload does not drop the newer value', () => {
  // The write is in flight when a newer value arrives. Clearing the entry on
  // that stale success would discard the new value, unwritten and unreported.
  const w = q()
  w.enqueue('k', 'old', T0)
  const [inFlight] = w.claimReady(T0 + OPTS.debounceMs, 4)

  w.enqueue('k', 'new', T0 + OPTS.debounceMs + 1)
  w.onSuccess(inFlight)

  assert.equal(w.size, 1, 'the newer value was dropped')
  w.forceReady(T0 + 99_999)
  assert.equal(w.claimReady(T0 + 99_999, 4)[0].payload, 'new')
})

test('a late failure for a superseded payload does not penalise the newer value', () => {
  // Subtle: the damage is not immediate retirement, it is the newer value
  // inheriting failures it never had. It would then give up after fewer real
  // failures than intended and be dropped without ever being written.
  const w = q()
  w.enqueue('k', 'old', T0)
  const [inFlight] = w.claimReady(T0 + OPTS.debounceMs, 4)

  w.enqueue('k', 'new', T0 + OPTS.debounceMs + 1)
  const retired = w.onFailure(inFlight, T0 + OPTS.debounceMs + 2)

  assert.equal(retired, false)
  assert.equal(w.size, 1, 'the newer value was retired by an older payload failure')
  assert.equal(
    w.attemptsFor('k'),
    0,
    'the newer value inherited an attempt from a payload that was already superseded'
  )
})

test('a successful write clears the key', () => {
  const w = q()
  w.enqueue('k', 'v', T0)
  const [entry] = w.claimReady(T0 + OPTS.debounceMs, 4)
  w.onSuccess(entry)
  assert.equal(w.size, 0)
})

test('claimReady honours the concurrency cap', () => {
  // The isolate allows 40 in-flight host calls across EVERYTHING, and excess
  // calls reject immediately rather than queueing.
  const w = q()
  for (let i = 0; i < 10; i++) w.enqueue(`k${i}`, 'v', T0)
  assert.equal(w.claimReady(T0 + OPTS.debounceMs, 4).length, 4)
})

test('a claimed entry is not handed out twice while in flight', () => {
  const w = q()
  w.enqueue('k', 'v', T0)
  const now = T0 + OPTS.debounceMs
  assert.equal(w.claimReady(now, 4).length, 1)
  assert.equal(w.claimReady(now, 4).length, 0, 'same key claimed twice concurrently')
})

test('claimReady with no capacity claims nothing', () => {
  const w = q()
  w.enqueue('k', 'v', T0)
  assert.equal(w.claimReady(T0 + OPTS.debounceMs, 0).length, 0)
  assert.equal(w.claimReady(T0 + OPTS.debounceMs, -1).length, 0)
})

test('forceReady makes everything immediately claimable', () => {
  // Used when the last player leaves: the server shuts down shortly after, and
  // anything still waiting on a debounce is lost for good.
  const w = q()
  for (let i = 0; i < 3; i++) w.enqueue(`k${i}`, 'v', T0)
  assert.equal(w.claimReady(T0, 10).length, 0)
  w.forceReady(T0)
  assert.equal(w.claimReady(T0, 10).length, 3)
})
