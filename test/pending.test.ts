import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PendingRequests } from '../src/net/pending.ts'

const TIMEOUT = 8000
const T0 = 1_800_000_000_000
const p = () => new PendingRequests<number>(TIMEOUT)

test('a request is outstanding until answered', () => {
  const r = p()
  r.add(1, T0)
  assert.ok(r.has(1))
  r.resolve(1)
  assert.ok(!r.has(1))
})

test('an unanswered request expires and is reported', () => {
  // THE bug this exists for: the server silently discards messages sent while it
  // cold-starts. Without expiry, one lost message leaves that hand untappable
  // for the rest of the session — and a visitor arriving at a sleeping world is
  // exactly the player who hits it.
  const r = p()
  r.add(1, T0)
  assert.deepEqual(r.expire(T0 + TIMEOUT - 1), [], 'expired early')
  assert.deepEqual(r.expire(T0 + TIMEOUT), [1], 'never expired')
  assert.ok(!r.has(1), 'still locked after expiring')
})

test('an answered request never expires afterwards', () => {
  const r = p()
  r.add(1, T0)
  r.resolve(1)
  assert.deepEqual(r.expire(T0 + TIMEOUT * 10), [])
})

test('expiry only drops what is actually overdue', () => {
  const r = p()
  r.add(1, T0)
  r.add(2, T0 + TIMEOUT)
  assert.deepEqual(r.expire(T0 + TIMEOUT), [1])
  assert.ok(r.has(2), 'dropped a request that was still in time')
})

test('re-sending refreshes the deadline', () => {
  // A retry must get a full window, not inherit the original request's age.
  const r = p()
  r.add(1, T0)
  r.add(1, T0 + TIMEOUT - 1)
  assert.deepEqual(r.expire(T0 + TIMEOUT), [], 'retry expired on the original deadline')
  assert.deepEqual(r.expire(T0 + TIMEOUT * 2), [1])
})

test('expiring an empty set is free and harmless', () => {
  const r = p()
  assert.deepEqual(r.expire(T0), [])
  assert.equal(r.size, 0)
})

test('clear drops everything', () => {
  const r = p()
  r.add(1, T0)
  r.add(2, T0)
  r.clear()
  assert.equal(r.size, 0)
  assert.deepEqual(r.expire(T0 + TIMEOUT * 10), [])
})

test('many outstanding requests all expire', () => {
  const r = p()
  for (let i = 0; i < 20; i++) r.add(i, T0)
  assert.equal(r.expire(T0 + TIMEOUT).length, 20)
  assert.equal(r.size, 0)
})
