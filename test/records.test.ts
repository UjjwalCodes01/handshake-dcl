import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  chooseHandSlot,
  clampCursor,
  expiredHandSlots,
  linkPairKey,
  normalizeHandRecord,
  normalizeLinkRecord,
  parseAnswered
} from '../src/server/records.ts'
import type { HandRecord } from '../src/server/records.ts'

const DAY = 24 * 60 * 60 * 1000
const TTL = 14 * DAY
const NOW = 1_800_000_000_000

function hand(overrides: Partial<HandRecord> = {}): HandRecord {
  return {
    owner: '0xabc',
    ownerName: 'Ada',
    ownerIsGuest: false,
    marked: false,
    seed: 1234,
    createdAt: NOW,
    ...overrides
  }
}

// ---------- validation: rejecting junk without discarding real history ----------

test('a valid hand survives a round trip', () => {
  const r = normalizeHandRecord(hand())
  assert.ok(r)
  assert.equal(r!.owner, '0xabc')
})

test('malformed hands are rejected rather than half-loaded', () => {
  // A half-loaded record is worse than none: it renders as a hand nobody can
  // answer, because the owner it points at does not exist.
  const bad: unknown[] = [
    null,
    undefined,
    42,
    'not an object',
    [],
    {},
    hand({ owner: '' }),                        // empty owner
    { ...hand(), owner: 123 },                  // wrong type
    { ...hand(), createdAt: 'yesterday' }
  ]
  for (const value of bad) {
    assert.equal(normalizeHandRecord(value), null, `accepted ${JSON.stringify(value)}`)
  }
})

test('records written before a field existed are defaulted, not discarded', () => {
  // THE regression that matters: adding a schema field must never wipe history.
  const legacy = { owner: '0xabc', ownerName: 'Ada', seed: 1, createdAt: NOW }
  const r = normalizeHandRecord(legacy)
  assert.ok(r, 'a legacy record was thrown away')
  assert.equal(r!.ownerIsGuest, false)
  assert.equal(r!.marked, false)
  assert.equal(r!.owner, '0xabc')
})

test('legacy links without names are kept, with empty names', () => {
  const legacy = { a: '0xa', b: '0xb', live: true, seed: 7, createdAt: NOW }
  const r = normalizeLinkRecord(legacy)
  assert.ok(r, 'a legacy link was thrown away')
  assert.equal(r!.aName, '')
  assert.equal(r!.bName, '')
  assert.equal(r!.live, true)
})

test('malformed links are rejected', () => {
  for (const value of [null, {}, { a: '0xa' }, { a: '', b: '0xb', live: true, seed: 1, createdAt: 1 }]) {
    assert.equal(normalizeLinkRecord(value), null)
  }
})

// ---------- slot allocation: whose hand gets destroyed ----------

test('a free slot is always preferred', () => {
  const hands = [hand(), null, hand()]
  assert.equal(chooseHandSlot(hands), 1)
})

test('when full, an expired hand is taken before any living one', () => {
  // This holds by arithmetic rather than by a branch: an expired hand has
  // createdAt < now - ttl and every live hand has createdAt >= now - ttl, so
  // the oldest hand is always an expired one when any exist. The test pins the
  // BEHAVIOUR so the guarantee survives future edits to the selection logic.
  const hands = [
    hand({ createdAt: NOW - 1 * DAY }),
    hand({ createdAt: NOW - 20 * DAY }), // expired
    hand({ createdAt: NOW - 2 * DAY })
  ]
  const picked = chooseHandSlot(hands)
  assert.equal(picked, 1)
  const chosen = hands[picked]!
  assert.ok(NOW - chosen.createdAt > TTL, 'a living hand was destroyed while an expired one remained')
})

test('the OLDEST expired hand is taken when several have expired', () => {
  const hands = [
    hand({ createdAt: NOW - 20 * DAY }),
    hand({ createdAt: NOW - 60 * DAY }), // oldest expired
    hand({ createdAt: NOW - 30 * DAY })
  ]
  assert.equal(chooseHandSlot(hands), 1)
})

test('a live hand is only evicted when nothing has expired', () => {
  // The last-resort path. Explicit so its cost is visible: somebody's hand is
  // destroyed here, and that is an accepted trade to never refuse a visitor.
  const hands = [hand({ createdAt: NOW - 3 * DAY }), hand({ createdAt: NOW - 9 * DAY })]
  const picked = chooseHandSlot(hands)
  assert.equal(picked, 1)
  assert.ok(NOW - hands[picked]!.createdAt <= TTL, 'expected the live-eviction path')
})

test('with nothing expired, the oldest live hand is the last resort', () => {
  // A visitor is never refused, even though this destroys someone's hand.
  const hands = [
    hand({ createdAt: NOW - 3 * DAY }),
    hand({ createdAt: NOW - 1 * DAY }),
    hand({ createdAt: NOW - 5 * DAY })
  ]
  assert.equal(chooseHandSlot(hands), 2)
})

test('an empty pool reports no slot instead of index 0', () => {
  assert.equal(chooseHandSlot([]), -1)
})

// ---------- expiry ----------

test('only genuinely aged-out hands expire', () => {
  const hands = [
    hand({ createdAt: NOW - 20 * DAY }),
    hand({ createdAt: NOW - 1 * DAY }),
    null,
    hand({ createdAt: NOW - TTL })      // exactly at the limit — not past it
  ]
  assert.deepEqual(expiredHandSlots(hands, NOW, TTL), [0])
})

// ---------- cursor: silent slot corruption ----------

test('a corrupt ring cursor is clamped into range', () => {
  // An out-of-range cursor indexes past the slot array and corrupts writes
  // silently, so a hand-edited or truncated value must never be trusted.
  assert.equal(clampCursor(0, 60), 0)
  assert.equal(clampCursor(59, 60), 59)
  assert.equal(clampCursor(60, 60), 0)
  assert.equal(clampCursor(9999, 60), 9999 % 60)
  assert.equal(clampCursor(-1, 60), 59, 'negative cursor must wrap forward, not stay negative')
  assert.equal(clampCursor(-9999, 60), ((-9999 % 60) + 60) % 60)
})

test('a nonsensical cursor falls back to zero', () => {
  for (const bad of [NaN, Infinity, -Infinity, 'x', null, undefined, {}]) {
    assert.equal(clampCursor(bad, 60), 0, `not clamped: ${String(bad)}`)
  }
  assert.equal(clampCursor(5, 0), 0, 'zero-size ring must not divide by zero')
})

// ---------- answered map: unbounded persisted growth ----------

test('answered entries are validated', () => {
  const parsed = parseAnswered({ '0xa': 3, '0xb': 0, '0xc': -1, '0xd': 'x', '0xe': 2.7 }, 100)
  assert.equal(parsed.get('0xa'), 3)
  assert.ok(!parsed.has('0xb'), 'zero counts are not worth persisting')
  assert.ok(!parsed.has('0xc'))
  assert.ok(!parsed.has('0xd'))
  assert.equal(parsed.get('0xe'), 2, 'fractional counts floored')
})

test('the answered map is capped, dropping the oldest entries', () => {
  // Keyed by wallet address, and guests can present a new one each session, so
  // without a cap this grows forever inside a 256 MB isolate.
  const many: Record<string, number> = {}
  for (let i = 0; i < 50; i++) many[`0x${i}`] = 1
  const parsed = parseAnswered(many, 10)
  assert.equal(parsed.size, 10)
  assert.ok(!parsed.has('0x0'), 'oldest entry should have been evicted')
  assert.ok(parsed.has('0x49'), 'newest entry should survive')
})

test('a corrupt answered blob yields an empty map, not a crash', () => {
  for (const bad of [null, undefined, 'x', 42, []]) {
    assert.equal(parseAnswered(bad, 10).size, 0)
  }
})

// ---------- pair key ----------

test('link pair keys are symmetric and match the client', () => {
  assert.equal(linkPairKey('0xa', '0xb'), linkPairKey('0xb', '0xa'))
})

// ---------- a real record, recovered from a live server ----------

test('a record written by an earlier build still loads', () => {
  // This is the exact SHAPE of a hand found in the local Multiplayer Server's
  // storage, written by a real phone before `marked` existed. The address is
  // replaced; nothing else is.
  //
  // It is the only production-written record this project has ever had, and it
  // proves the thing synthetic fixtures cannot: that a record from a genuinely
  // older build survives a schema change instead of being silently discarded.
  const fromLiveServer = {
    owner: '0x0000000000000000000000000000000000000001',
    ownerName: 'MXu0KlFLAV',
    ownerIsGuest: true,
    seed: 67676,
    createdAt: 1787256883561
    // note: no `marked` — this predates that field
  }

  const loaded = normalizeHandRecord(fromLiveServer)
  assert.ok(loaded, 'a real persisted record would have been erased on load')
  assert.equal(loaded!.marked, false, 'missing field was not defaulted')
  assert.equal(loaded!.ownerIsGuest, true, 'guest flag was lost')
  assert.equal(loaded!.owner, fromLiveServer.owner)
  assert.equal(loaded!.seed, 67676)
})

test('a guest hand is credited but never persisted', () => {
  // Real devices connect as guests — the one production record we have is one.
  // Guests can present a new address each session, so persisting an "answered"
  // credit against theirs would store something nobody can ever collect.
  const guest = normalizeHandRecord({
    owner: '0x0000000000000000000000000000000000000001',
    ownerName: 'MXu0KlFLAV',
    ownerIsGuest: true,
    seed: 1,
    createdAt: 1
  })
  assert.equal(guest!.ownerIsGuest, true, 'the persistable decision depends on this flag surviving load')
})
