import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OfferTracker, PairCooldowns } from '../src/systems/offers.ts'

const WINDOW = 3000
const COOLDOWN = 20000
const T0 = 1_800_000_000_000

const ME = '0xme'
const THEM = '0xthem'
const OTHER = '0xother'

const tracker = () => new OfferTracker(WINDOW)

// ---------- the stale-offer bug: consent must be current ----------

test('a first sighting is never treated as fresh', () => {
  // We have no idea how old it is — they may have tapped a minute before we
  // arrived. Treating it as fresh would let a stale, "sticky" offer complete a
  // handshake without that person consenting at this moment, which is the whole
  // premise of mutual confirmation.
  const t = tracker()
  t.observe(THEM, 7, ME, T0)
  assert.equal(t.hasIncomingOffer(THEM, ME, T0), false)
  assert.equal(t.hasIncomingOffer(THEM, ME, T0 + 1), false)
})

test('an offer counts only once we witness the sequence change', () => {
  const t = tracker()
  t.observe(THEM, 7, '', T0)          // first sighting, not fresh
  t.observe(THEM, 8, ME, T0 + 500)    // witnessed: they just tapped
  assert.equal(t.hasIncomingOffer(THEM, ME, T0 + 500), true)
})

test('a witnessed offer goes stale after the window', () => {
  const t = tracker()
  t.observe(THEM, 1, '', T0)
  t.observe(THEM, 2, ME, T0 + 100)
  assert.equal(t.hasIncomingOffer(THEM, ME, T0 + 100 + WINDOW), true, 'expired exactly at the boundary')
  assert.equal(t.hasIncomingOffer(THEM, ME, T0 + 101 + WINDOW), false, 'never went stale')
})

test('repeating the same sequence does not refresh an offer', () => {
  // Otherwise an unchanged intent, re-read every tick, would stay "fresh"
  // forever and never expire.
  const t = tracker()
  t.observe(THEM, 1, '', T0)
  t.observe(THEM, 2, ME, T0 + 100)
  for (let i = 0; i < 50; i++) t.observe(THEM, 2, ME, T0 + 200 + i * 100)
  assert.equal(t.hasIncomingOffer(THEM, ME, T0 + 101 + WINDOW), false, 'a repeated read kept it alive')
})

test('an offer aimed at somebody else is not an offer to us', () => {
  const t = tracker()
  t.observe(THEM, 1, '', T0)
  t.observe(THEM, 2, OTHER, T0 + 100)
  assert.equal(t.hasIncomingOffer(THEM, ME, T0 + 200), false)
})

test('withdrawing an offer takes effect', () => {
  const t = tracker()
  t.observe(THEM, 1, '', T0)
  t.observe(THEM, 2, ME, T0 + 100)
  assert.equal(t.hasIncomingOffer(THEM, ME, T0 + 150), true)
  t.observe(THEM, 3, '', T0 + 200) // cleared their target
  assert.equal(t.hasIncomingOffer(THEM, ME, T0 + 250), false)
})

test('an unknown identity can never receive an offer', () => {
  const t = tracker()
  t.observe(THEM, 1, '', T0)
  t.observe(THEM, 2, '', T0 + 100)
  assert.equal(t.hasIncomingOffer(THEM, '', T0 + 150), false, 'matched an empty self address')
})

test('a player who left cannot complete a handshake', () => {
  // Their offer would otherwise linger and pair with nobody.
  const t = tracker()
  t.observe(THEM, 1, '', T0)
  t.observe(THEM, 2, ME, T0 + 100)
  t.prune((address) => address !== THEM)
  assert.equal(t.hasIncomingOffer(THEM, ME, T0 + 150), false)
  assert.equal(t.size, 0)
})

test('pruning keeps players who are still present', () => {
  const t = tracker()
  t.observe(THEM, 1, '', T0)
  t.observe(OTHER, 1, '', T0)
  t.prune((address) => address === THEM)
  assert.equal(t.size, 1)
})

// ---------- cooldowns ----------

test('a pair is on cooldown immediately after shaking hands', () => {
  const c = new PairCooldowns(COOLDOWN)
  c.record(ME, THEM, T0)
  assert.equal(c.isOnCooldown(ME, THEM, T0), true)
  assert.equal(c.isOnCooldown(THEM, ME, T0), true, 'cooldown must be order-independent')
})

test('a cooldown expires', () => {
  const c = new PairCooldowns(COOLDOWN)
  c.record(ME, THEM, T0)
  assert.equal(c.isOnCooldown(ME, THEM, T0 + COOLDOWN - 1), true)
  assert.equal(c.isOnCooldown(ME, THEM, T0 + COOLDOWN), false)
})

test('cooldowns do not leak between different pairs', () => {
  const c = new PairCooldowns(COOLDOWN)
  c.record(ME, THEM, T0)
  assert.equal(c.isOnCooldown(ME, OTHER, T0), false)
})

test('expired cooldowns are pruned so the map cannot grow all session', () => {
  const c = new PairCooldowns(COOLDOWN)
  for (let i = 0; i < 100; i++) c.record(ME, `0x${i}`, T0)
  assert.equal(c.size, 100)
  c.prune(T0 + COOLDOWN)
  assert.equal(c.size, 0)
})

test('pruning keeps cooldowns that are still active', () => {
  const c = new PairCooldowns(COOLDOWN)
  c.record(ME, THEM, T0)
  c.record(ME, OTHER, T0 + COOLDOWN)
  c.prune(T0 + COOLDOWN)
  assert.equal(c.size, 1)
  assert.equal(c.isOnCooldown(ME, OTHER, T0 + COOLDOWN), true)
})
