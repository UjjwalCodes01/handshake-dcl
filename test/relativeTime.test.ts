import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shortAge } from '../src/ui/relativeTime.ts'

const NOW = 1_800_000_000_000
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

test('formats each unit at its boundary', () => {
  assert.equal(shortAge(NOW - 0, NOW), 'now')
  assert.equal(shortAge(NOW - 59_000, NOW), 'now')
  assert.equal(shortAge(NOW - MIN, NOW), '1m')
  assert.equal(shortAge(NOW - 59 * MIN, NOW), '59m')
  assert.equal(shortAge(NOW - HOUR, NOW), '1h')
  assert.equal(shortAge(NOW - 23 * HOUR, NOW), '23h')
  assert.equal(shortAge(NOW - DAY, NOW), '1d')
  assert.equal(shortAge(NOW - 14 * DAY, NOW), '14d')
})

test('a server clock AHEAD of ours never renders a negative age', () => {
  // createdAt is the SERVER's clock, `now` is the client's. They are different
  // clocks. If the server is even slightly ahead, a naive subtraction yields a
  // negative number and something like "-1m" appears on screen.
  assert.equal(shortAge(NOW + 5_000, NOW), 'now')
  assert.equal(shortAge(NOW + DAY, NOW), 'now')
  assert.equal(shortAge(NOW + 365 * DAY, NOW), 'now')
})

test('a badly wrong device clock does not render an absurd age', () => {
  // A phone whose date is set to 1970 would otherwise show "19000d".
  assert.equal(shortAge(1000, NOW), '')
  assert.equal(shortAge(NOW - 5000 * DAY, NOW), '')
})

test('missing or nonsensical timestamps produce empty output, not NaN', () => {
  for (const bad of [0, -1, NaN, Infinity, -Infinity]) {
    const out = shortAge(bad, NOW)
    assert.equal(out, '', `expected empty for ${bad}, got ${JSON.stringify(out)}`)
  }
})

test('output is always short enough for a phone HUD', () => {
  // This string sits inside a fixed-width panel; anything long would overflow.
  for (let d = 0; d < 999; d += 37) {
    assert.ok(shortAge(NOW - d * DAY, NOW).length <= 4)
  }
})
