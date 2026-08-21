import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hashString } from '../src/hash.ts'
import { slotPlacement } from '../src/placement.ts'

test('hashString is deterministic', () => {
  // Every client derives entity placement from this. If it ever differed between
  // two clients they would render the same handshake in different places.
  for (const input of ['', 'a', '0xabc|0xdef', 'a'.repeat(200)]) {
    assert.equal(hashString(input), hashString(input), `unstable for ${JSON.stringify(input)}`)
  }
})

test('hashString stays inside unsigned 32-bit range', () => {
  // The result is fed to `% n` for slot maths. A negative value would produce a
  // negative index and place an entity into a slot that does not exist.
  for (let i = 0; i < 2000; i++) {
    const h = hashString(`seed-${i}`)
    assert.ok(Number.isInteger(h), `not an integer: ${h}`)
    assert.ok(h >= 0, `negative hash: ${h}`)
    assert.ok(h <= 0xffffffff, `out of 32-bit range: ${h}`)
  }
})

test('hashString spreads distinct inputs across buckets', () => {
  // Not a cryptographic claim — just that placement will not pile every entity
  // onto one spot. Anything under ~half the buckets used would be a red flag.
  const buckets = new Set<number>()
  for (let i = 0; i < 1000; i++) buckets.add(hashString(`0xabc|0xdef|${i}`) % 60)
  assert.ok(buckets.size > 45, `only ${buckets.size}/60 buckets used`)
})

test('slotPlacement returns angles and heights in range', () => {
  const total = 60
  for (let i = 0; i < total; i++) {
    for (const seed of [0, 1, 999, 12345, 0xffffffff]) {
      const { angleDeg, height01 } = slotPlacement(i, total, seed)
      assert.ok(angleDeg >= 0 && angleDeg < 360, `angle out of range: ${angleDeg}`)
      assert.ok(height01 >= 0 && height01 <= 1, `height out of range: ${height01}`)
    }
  }
})

test('slotPlacement is deterministic', () => {
  const a = slotPlacement(7, 24, 4242)
  const b = slotPlacement(7, 24, 4242)
  assert.deepEqual(a, b)
})

test('slots never overlap, for any seed', () => {
  // THE claim index-based placement was introduced to guarantee. The earlier
  // seed-only version let two hands collide into one un-tappable lump, so this
  // is the regression that matters most.
  for (const total of [4, 24, 60]) {
    const arc = 360 / total
    for (let i = 0; i < total; i++) {
      const next = (i + 1) % total
      for (const seedA of [0, 250, 500, 750, 999, 123456]) {
        for (const seedB of [0, 250, 500, 750, 999, 987654]) {
          const a = slotPlacement(i, total, seedA).angleDeg
          const b = slotPlacement(next, total, seedB).angleDeg
          // Smallest angular separation, accounting for the 0/360 wrap.
          const raw = Math.abs(a - b)
          const gap = Math.min(raw, 360 - raw)
          assert.ok(
            gap > arc * 0.4,
            `slots ${i}/${next} of ${total} only ${gap.toFixed(2)}deg apart (arc ${arc.toFixed(2)})`
          )
        }
      }
    }
  }
})

test('slotPlacement survives a zero total instead of dividing by zero', () => {
  const { angleDeg, height01 } = slotPlacement(0, 0, 123)
  assert.ok(Number.isFinite(angleDeg), 'angle is not finite')
  assert.ok(Number.isFinite(height01), 'height is not finite')
})
