import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DAY_SECONDS, dayPhase, daylightAt, moodFor, moodStep } from '../src/daylight.ts'

test('phase maps a day onto 0..1 with noon at the middle', () => {
  assert.equal(dayPhase(0), 0)
  assert.ok(Math.abs(dayPhase(DAY_SECONDS / 2) - 0.5) < 1e-9)
  assert.ok(dayPhase(DAY_SECONDS) < 1e-9, 'a full day did not wrap back to zero')
})

test('phase wraps rather than running away', () => {
  // getWorldTime may report a value well past one day; an unwrapped phase would
  // push the mood curve out of range and the scene would settle at a constant.
  assert.ok(Math.abs(dayPhase(DAY_SECONDS * 7.5) - 0.5) < 1e-9)
  assert.ok(dayPhase(-DAY_SECONDS / 4) >= 0, 'negative time produced a negative phase')
  assert.ok(dayPhase(-DAY_SECONDS / 4) <= 1)
})

test('a broken clock leaves the scene at midday rather than pitch dark', () => {
  // If the host call returns nonsense, a fully dark world looks broken. Neutral
  // daylight is the safe failure.
  for (const bad of [NaN, Infinity, -Infinity]) {
    assert.equal(dayPhase(bad), 0.5)
  }
})

test('daylight peaks at noon and bottoms at midnight', () => {
  assert.ok(daylightAt(0) < 0.001, 'midnight was not dark')
  assert.ok(daylightAt(0.5) > 0.999, 'noon was not bright')
  assert.ok(Math.abs(daylightAt(0.25) - 0.5) < 1e-9, 'dawn was not halfway')
  assert.ok(Math.abs(daylightAt(0.75) - 0.5) < 1e-9, 'dusk was not halfway')
})

test('daylight stays in range for any input', () => {
  for (let i = -50; i <= 150; i++) {
    const d = daylightAt(i / 100)
    assert.ok(d >= 0 && d <= 1, `daylight ${d} out of range at phase ${i / 100}`)
  }
})

test('the curve is smooth — no visible jump between adjacent moments', () => {
  // A hard cut between day and night would read as a rendering bug rather than
  // a sunset.
  let previous = daylightAt(0)
  for (let i = 1; i <= 1000; i++) {
    const next = daylightAt(i / 1000)
    assert.ok(Math.abs(next - previous) < 0.01, `jump of ${Math.abs(next - previous)} at ${i / 1000}`)
    previous = next
  }
})

test('the lattice out-glows the world at night and softens by day', () => {
  // The whole point of the inversion: after dark the structure should be the
  // light source, not a lit object.
  const night = moodFor(0)
  const noon = moodFor(0.5)
  assert.ok(night.glow > 1, 'emissive surfaces were not boosted at night')
  assert.ok(noon.glow < 1, 'emissive surfaces were not softened at noon')
  assert.ok(night.glow > noon.glow)
})

test('the ground darkens at night and lightens by day', () => {
  const night = moodFor(0)
  const noon = moodFor(0.5)
  const brightness = (c: { r: number; g: number; b: number }) => c.r + c.g + c.b
  assert.ok(brightness(noon.ground) > brightness(night.ground) * 2, 'day and night grounds look alike')
})

test('ground colour stays inside 0..1 across the whole cycle', () => {
  for (let i = 0; i <= 100; i++) {
    const { ground } = moodFor(i / 100)
    for (const channel of [ground.r, ground.g, ground.b]) {
      assert.ok(channel >= 0 && channel <= 1, `channel ${channel} out of range at phase ${i / 100}`)
    }
  }
})

test('mood steps bucket the day so materials are rarely rewritten', () => {
  const STEPS = 48
  assert.equal(moodStep(0, STEPS), 0)
  assert.equal(moodStep(0.5, STEPS), STEPS / 2)
  assert.ok(moodStep(0.999, STEPS) < STEPS, 'step ran past the end of the day')

  const seen = new Set<number>()
  for (let i = 0; i < 1000; i++) seen.add(moodStep(i / 1000, STEPS))
  assert.equal(seen.size, STEPS, `expected ${STEPS} distinct repaints per day, got ${seen.size}`)
})

test('mood steps survive nonsense input', () => {
  assert.equal(moodStep(NaN, 48), moodStep(0.5, 48))
  assert.equal(moodStep(0.5, 0), 0, 'zero steps must not divide by zero')
})
