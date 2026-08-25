import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NameTable } from '../src/server/names.ts'

const CAP = 5
const MAXLEN = 24

test('a name is remembered and returned', () => {
  const t = new NameTable(CAP, MAXLEN)
  t.remember('0xa', 'Ada')
  assert.equal(t.get('0xa'), 'Ada')
})

test('an unknown address returns empty, not undefined', () => {
  const t = new NameTable(CAP, MAXLEN)
  assert.equal(t.get('0xzz'), '')
})

test('an empty name never erases a known one', () => {
  // Guests and unresolved profiles report '', and losing a name to that turns a
  // recognisable person into an anonymous row on the roll.
  const t = new NameTable(CAP, MAXLEN)
  t.remember('0xa', 'Ada')
  t.remember('0xa', '')
  assert.equal(t.get('0xa'), 'Ada')
})

test('newcomers are ALWAYS named, even when the table is full', () => {
  // THE bug this exists for. Refusing new entries once full bounds memory but
  // means that after CAP unique visitors nobody new is ever named again — hands
  // and links quietly start showing as anonymous, and only in a world
  // successful enough to have had that many visitors.
  const t = new NameTable(CAP, MAXLEN)
  for (let i = 0; i < CAP; i++) t.remember(`0x${i}`, `P${i}`)
  t.remember('0xnew', 'Newcomer')
  assert.equal(t.get('0xnew'), 'Newcomer', 'a newcomer was refused a name in a full table')
})

test('the table stays bounded however many strangers arrive', () => {
  const t = new NameTable(CAP, MAXLEN)
  for (let i = 0; i < 500; i++) t.remember(`0x${i}`, `P${i}`)
  assert.equal(t.size, CAP)
})

test('eviction drops the least recently seen', () => {
  const t = new NameTable(3, MAXLEN)
  t.remember('0xa', 'A')
  t.remember('0xb', 'B')
  t.remember('0xc', 'C')
  t.remember('0xa', 'A')          // 0xa seen again -> now most recent
  t.remember('0xd', 'D')          // evicts the oldest, which is now 0xb
  assert.equal(t.get('0xa'), 'A', 'evicted a recently seen name')
  assert.equal(t.get('0xb'), '', 'kept the least recently seen name')
  assert.equal(t.get('0xd'), 'D')
})

test('re-seeing a player with an empty name still refreshes their recency', () => {
  // A returning guest keeps their name AND stops being the eviction candidate.
  const t = new NameTable(3, MAXLEN)
  t.remember('0xa', 'A')
  t.remember('0xb', 'B')
  t.remember('0xc', 'C')
  t.remember('0xa', '')           // seen again, no name reported
  t.remember('0xd', 'D')
  assert.equal(t.get('0xa'), 'A', 'a returning player was evicted despite being seen')
})

test('long names are truncated before storage', () => {
  // Attacker-supplied text, synced to every other client.
  const t = new NameTable(CAP, MAXLEN)
  t.remember('0xa', 'x'.repeat(500))
  assert.equal(t.get('0xa').length, MAXLEN)
})

test('an empty address is ignored', () => {
  const t = new NameTable(CAP, MAXLEN)
  t.remember('', 'Nobody')
  assert.equal(t.size, 0)
})

test('forgetting a player removes their name', () => {
  const t = new NameTable(CAP, MAXLEN)
  t.remember('0xa', 'Ada')
  t.forget('0xa')
  assert.equal(t.get('0xa'), '')
})
