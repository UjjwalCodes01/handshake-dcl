import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LiveClaims, RateLimiter } from '../src/server/guards.ts'

const T0 = 1_800_000_000_000
const MAX = 8
const WINDOW = 10_000
const CLAIM_WINDOW = 6000

const A = '0xa'
const B = '0xb'
const C = '0xc'

// ---------- rate limiting ----------

test('actions up to the limit are allowed', () => {
  const r = new RateLimiter(MAX, WINDOW)
  for (let i = 0; i < MAX; i++) {
    assert.equal(r.check(A, T0), false, `refused action ${i + 1} of ${MAX}`)
  }
})

test('the action past the limit is refused', () => {
  const r = new RateLimiter(MAX, WINDOW)
  for (let i = 0; i < MAX; i++) r.check(A, T0)
  assert.equal(r.check(A, T0), true)
})

test('a refused attempt does not extend the lockout', () => {
  // Otherwise a client hammering the server would keep pushing its own window
  // forward and stay locked out indefinitely, which turns a rate limit into a
  // permanent ban for anyone with a stuck retry loop.
  const r = new RateLimiter(MAX, WINDOW)
  for (let i = 0; i < MAX; i++) r.check(A, T0)
  for (let i = 0; i < 50; i++) r.check(A, T0 + 1000)
  assert.equal(r.check(A, T0 + WINDOW), false, 'still locked out after the window rolled forward')
})

test('the window rolls forward', () => {
  const r = new RateLimiter(MAX, WINDOW)
  for (let i = 0; i < MAX; i++) r.check(A, T0)
  assert.equal(r.check(A, T0 + WINDOW - 1), true, 'allowed too early')
  assert.equal(r.check(A, T0 + WINDOW), false, 'never recovered')
})

test('players are limited independently', () => {
  // A limiter keyed wrongly would let one busy player lock out everybody else.
  const r = new RateLimiter(MAX, WINDOW)
  for (let i = 0; i < MAX; i++) r.check(A, T0)
  assert.equal(r.check(A, T0), true)
  assert.equal(r.check(B, T0), false, 'one player exhausted another player\'s budget')
})

test('a departing player is forgotten', () => {
  const r = new RateLimiter(MAX, WINDOW)
  r.check(A, T0)
  assert.equal(r.trackedPlayers, 1)
  r.forget(A)
  assert.equal(r.trackedPlayers, 0)
})

// ---------- two-sided handshake corroboration ----------

test('one claim alone never completes a handshake', () => {
  // THE anti-cheat. HandshakeIntent is peer-owned, so a modified client can
  // write an intent carrying someone else's address and manufacture the look of
  // mutual consent. Acting on a single report would let a cheater force a
  // handshake with any player standing nearby.
  const c = new LiveClaims(CLAIM_WINDOW)
  assert.equal(c.claim(A, B, T0), null)
})

test('a player cannot corroborate themselves', () => {
  // The forged-consent path: the same client reporting twice must not count as
  // two independent claims.
  const c = new LiveClaims(CLAIM_WINDOW)
  assert.equal(c.claim(A, B, T0), null)
  assert.equal(c.claim(A, B, T0 + 100), null, 'a repeat from the same player completed a handshake')
  assert.equal(c.claim(A, B, T0 + 200), null)
})

test('two independent claims complete the handshake', () => {
  const c = new LiveClaims(CLAIM_WINDOW)
  assert.equal(c.claim(A, B, T0), null)
  const corroborating = c.claim(B, A, T0 + 500)
  assert.ok(corroborating, 'honest play failed to complete')
  assert.equal(corroborating!.from, A, 'reported the wrong corroborating player')
})

test('a completed pair does not linger and re-fire', () => {
  const c = new LiveClaims(CLAIM_WINDOW)
  c.claim(A, B, T0)
  c.claim(B, A, T0 + 100)
  assert.equal(c.size, 0, 'a completed claim was left behind')
})

test('corroboration must arrive inside the window', () => {
  const c = new LiveClaims(CLAIM_WINDOW)
  c.claim(A, B, T0)
  assert.equal(c.claim(B, A, T0 + CLAIM_WINDOW + 1), null, 'a stale claim was corroborated')
})

test('claims are order-independent', () => {
  const c = new LiveClaims(CLAIM_WINDOW)
  c.claim(B, A, T0)
  assert.ok(c.claim(A, B, T0 + 100), 'pairing depends on who claimed first')
})

test('claims about different partners do not cross-corroborate', () => {
  // A claim about B must never be completed by a claim about C.
  const c = new LiveClaims(CLAIM_WINDOW)
  c.claim(A, B, T0)
  assert.equal(c.claim(C, A, T0 + 100), null, 'unrelated pairs corroborated each other')
})

test('stale claims are pruned', () => {
  const c = new LiveClaims(CLAIM_WINDOW)
  for (let i = 0; i < 25; i++) c.claim(`0x${i}`, '0xz', T0)
  assert.ok(c.size > 0)
  c.prune(T0 + CLAIM_WINDOW + 1)
  assert.equal(c.size, 0)
})

test('pruning keeps claims still inside the window', () => {
  // Boundary semantics are deliberately consistent: a claim exactly at the
  // window is still corroboratable (<=), and prune drops only what is PAST it
  // (>). So pruning must happen strictly after the deadline to remove anything.
  const c = new LiveClaims(CLAIM_WINDOW)
  c.claim(A, B, T0)
  c.claim(C, B, T0 + CLAIM_WINDOW)
  c.prune(T0 + CLAIM_WINDOW + 1)
  assert.equal(c.size, 1, 'pruned the fresh claim as well as the stale one')
})

test('a claim exactly at the window boundary still corroborates', () => {
  // Pins the inclusive edge: an honest partner replying at the last possible
  // moment must not be refused, or a handshake both players saw complete would
  // silently produce nothing.
  const c = new LiveClaims(CLAIM_WINDOW)
  c.claim(A, B, T0)
  assert.ok(c.claim(B, A, T0 + CLAIM_WINDOW), 'refused a corroboration exactly on the deadline')
})

test('a departing player leaves no claim behind', () => {
  // Otherwise someone returning minutes later could corroborate a claim made
  // before they left, completing a handshake neither party is present for.
  const c = new LiveClaims(CLAIM_WINDOW)
  c.claim(A, B, T0)
  c.forget(A)
  assert.equal(c.claim(B, A, T0 + 100), null, 'a departed player\'s claim still completed')
})

test('rate-limit history is pruned for players who never left cleanly', () => {
  // forget() covers the clean case, but onLeaveScene does not fire on a crash or
  // a dropped connection. Without pruning, this table grows for every visitor
  // the world ever has — slow, but this scene is meant to stay up for a week of
  // judging inside a 256 MB isolate, and slow is long enough.
  const r = new RateLimiter(MAX, WINDOW)
  for (let i = 0; i < 200; i++) r.check(`0x${i}`, T0)
  assert.equal(r.trackedPlayers, 200)
  r.prune(T0 + WINDOW)
  assert.equal(r.trackedPlayers, 0, 'stale rate-limit history was retained')
})

test('pruning keeps players who are still active', () => {
  const r = new RateLimiter(MAX, WINDOW)
  r.check(A, T0)
  r.check(B, T0 + WINDOW)
  r.prune(T0 + WINDOW)
  assert.equal(r.trackedPlayers, 1, 'pruned an active player')
})
