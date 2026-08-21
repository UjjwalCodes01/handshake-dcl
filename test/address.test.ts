import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeAddress, pairKey } from '../src/net/address.ts'

test('normalizeAddress lowercases EIP-55 checksummed input', () => {
  // The exact failure this guards: the same wallet arriving checksummed from one
  // source and lowercase from another, so two clients disagree about identity.
  const checksummed = '0x57222D8E6fA2F03514F72C668DcAAdF6DFFcBc75'
  const lower = '0x57222d8e6fa2f03514f72c668dcaadf6dffcbc75'
  assert.equal(normalizeAddress(checksummed), lower)
  assert.equal(normalizeAddress(checksummed), normalizeAddress(lower))
})

test('normalizeAddress trims surrounding whitespace', () => {
  assert.equal(normalizeAddress('  0xABC  '), '0xabc')
})

test('normalizeAddress maps every empty-ish input to the same empty string', () => {
  // Callers treat '' as "identity not resolved yet" and skip work. If any of
  // these leaked through as a truthy value the scene would act on a bad address.
  for (const input of [undefined, null, '', '   ']) {
    assert.equal(normalizeAddress(input), '')
  }
})

test('pairKey is symmetric', () => {
  // Both participants compute this independently. If it were ever asymmetric the
  // same handshake would be recorded twice, or blocked outright.
  const a = '0xaaa'
  const b = '0xbbb'
  assert.equal(pairKey(a, b), pairKey(b, a))
})

test('pairKey distinguishes different pairs', () => {
  assert.notEqual(pairKey('0xaaa', '0xbbb'), pairKey('0xaaa', '0xccc'))
})

test('pairKey is stable across many orderings', () => {
  const addresses = ['0x01', '0x02', '0x03', '0xff', '0xa0']
  for (const x of addresses) {
    for (const y of addresses) {
      assert.equal(pairKey(x, y), pairKey(y, x), `asymmetric for ${x}/${y}`)
    }
  }
})
