import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseConnectors,
  pruneToTop,
  recordConnection,
  serialiseConnectors,
  topConnectors
} from '../src/server/ranking.ts'
import type { Connector } from '../src/server/ranking.ts'

const CAP = 50

function table(entries: Array<[string, number, string?]> = []): Map<string, Connector> {
  const t = new Map<string, Connector>()
  for (const [address, count, name] of entries) t.set(address, { address, name: name ?? '', count })
  return t
}

test('a first connection creates an entry', () => {
  const t = table()
  recordConnection(t, '0xa', 'Ada', CAP)
  assert.equal(t.get('0xa')?.count, 1)
  assert.equal(t.get('0xa')?.name, 'Ada')
})

test('further connections accumulate', () => {
  const t = table()
  for (let i = 0; i < 5; i++) recordConnection(t, '0xa', 'Ada', CAP)
  assert.equal(t.get('0xa')?.count, 5)
})

test('a changed display name is picked up', () => {
  const t = table()
  recordConnection(t, '0xa', 'Ada', CAP)
  recordConnection(t, '0xa', 'Ada L', CAP)
  assert.equal(t.get('0xa')?.name, 'Ada L')
})

test('an empty name never overwrites a known one', () => {
  // Guests and unresolved profiles report '', and losing a name to that would
  // turn a recognisable person into an anonymous row.
  const t = table()
  recordConnection(t, '0xa', 'Ada', CAP)
  recordConnection(t, '0xa', '', CAP)
  assert.equal(t.get('0xa')?.name, 'Ada')
})

test('an empty address is ignored', () => {
  const t = table()
  recordConnection(t, '', 'Nobody', CAP)
  assert.equal(t.size, 0)
})

test('ranking is by connection count, descending', () => {
  const t = table([['0xa', 3], ['0xb', 9], ['0xc', 5]])
  assert.deepEqual(topConnectors(t, 3).map((c) => c.address), ['0xb', '0xc', '0xa'])
})

test('ties break deterministically, so every client agrees', () => {
  // Two players at the anchor seeing the same names in a different order reads
  // as a bug, and Map iteration order depends on insertion.
  const a = table([['0xb', 4], ['0xa', 4], ['0xc', 4]])
  const b = table([['0xc', 4], ['0xb', 4], ['0xa', 4]])
  assert.deepEqual(
    topConnectors(a, 3).map((c) => c.address),
    topConnectors(b, 3).map((c) => c.address)
  )
})

test('the limit is respected', () => {
  const t = table(Array.from({ length: 20 }, (_, i) => [`0x${i}`, i] as [string, number]))
  assert.equal(topConnectors(t, 5).length, 5)
  assert.equal(topConnectors(t, 0).length, 0)
  assert.equal(topConnectors(t, -1).length, 0)
})

test('a newcomer to a mature world is always tracked', () => {
  // The failure this guards against is subtle: refusing newcomers once the table
  // is full means someone arriving late can never be recorded, so can never
  // climb, so the leaderboard freezes and stops meaning anything.
  const t = table()
  for (let i = 0; i < 10; i++) for (let n = 0; n < 3; n++) recordConnection(t, `0x${i}`, `P${i}`, 10)
  recordConnection(t, '0xnew', 'New', 10)
  assert.ok(t.has('0xnew'), 'a newcomer was refused entry to a full table')
  assert.equal(t.get('0xnew')?.count, 1)
})

test('memory stays bounded as strangers keep arriving', () => {
  // Keyed by wallet address, and guests present a new one each session, so
  // without pruning this grows forever inside a 256 MB isolate.
  const t = table()
  for (let i = 0; i < 500; i++) recordConnection(t, `0x${i}`, '', 10)
  assert.ok(t.size <= 20, `table grew to ${t.size} with a cap of 10`)
})

test('pruning keeps the strongest and drops the weakest', () => {
  const t = table()
  recordConnection(t, '0xstrong', '', 100)
  for (let n = 0; n < 9; n++) recordConnection(t, '0xstrong', '', 100)
  for (let i = 0; i < 30; i++) recordConnection(t, `0x${i}`, '', 100)
  pruneToTop(t, 5)
  assert.equal(t.size, 5)
  assert.ok(t.has('0xstrong'), 'pruning dropped the most-connected player')
})

test('persisted tables round-trip', () => {
  const t = table([['0xa', 3, 'Ada'], ['0xb', 9, 'Bo']])
  const restored = parseConnectors(serialiseConnectors(t, CAP), CAP)
  assert.equal(restored.get('0xb')?.count, 9)
  assert.equal(restored.get('0xa')?.name, 'Ada')
})

test('a corrupt persisted table yields an empty one, not a crash', () => {
  for (const bad of [null, undefined, 'x', 42, {}]) {
    assert.equal(parseConnectors(bad, CAP).size, 0)
  }
})

test('malformed rows are skipped, valid ones kept', () => {
  const restored = parseConnectors(
    [
      { address: '0xa', name: 'Ada', count: 3 },
      { address: '', name: 'x', count: 5 },
      { address: '0xb', count: 0 },
      { address: '0xc', name: 'C', count: 'many' },
      null,
      { address: '0xd', name: 'D', count: 2 }
    ],
    CAP
  )
  assert.deepEqual([...restored.keys()].sort(), ['0xa', '0xd'])
})

test('long names are truncated on load', () => {
  // Attacker-supplied text that is synced to every other client.
  const restored = parseConnectors([{ address: '0xa', name: 'x'.repeat(500), count: 1 }], CAP)
  assert.ok((restored.get('0xa')?.name.length ?? 0) <= 24)
})
