import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EchoMachine, Phase } from '../src/systems/echoMachine.ts'

const OPTS = {
  pillarCount: 4,
  roundLengths: [3, 4, 5] as const,
  leadInS: 0.8,
  flashOnS: 0.55,
  flashGapS: 0.25,
  resolveS: 1.6,
  graceS: 4,
  // Deterministic: round 0 -> [0,1,2], round 1 -> [0,1,2,3], etc.
  makeSequence: (_r: number, _a: number, length: number) =>
    Array.from({ length }, (_, i) => i % 4)
}

const machine = () => new EchoMachine({ ...OPTS })

/** Runs the machine forward, collecting which pillar was lit on each flash. */
function run(m: EchoMachine, seconds: number, nearRing = true, step = 0.05): number[] {
  const flashes: number[] = []
  let lastLit = -1
  for (let t = 0; t < seconds; t += step) {
    m.update(step, nearRing)
    const lit = m.litPillars()
    const now = lit.length === 1 ? lit[0] : -1
    if (now !== -1 && now !== lastLit) flashes.push(now)
    lastLit = now
  }
  return flashes
}

test('nothing happens until the player approaches', () => {
  const m = machine()
  m.update(10, false)
  assert.equal(m.phase, Phase.Idle)
})

test('the grace period stops an immediate ambush on arrival', () => {
  // A spawn once sat inside a pillar's trigger, dropping players into a memory
  // game before they had looked around. The spawn moved, but this makes the
  // ordering impossible to break by accident when the geometry is next tuned.
  const m = machine()
  m.update(OPTS.graceS - 0.1, true)
  assert.equal(m.phase, Phase.Idle, 'started before the grace period elapsed')
  m.update(0.2, true)
  assert.notEqual(m.phase, Phase.Idle, 'never started after the grace period')
})

test('the player is SHOWN exactly the sequence they are graded against', () => {
  // The bug this exists for: an off-by-one in playback shows a different
  // sequence from the one being scored, and the puzzle becomes unwinnable with
  // nothing on screen to explain why.
  const m = machine()
  m.update(OPTS.graceS, true)
  const flashes = run(m, 12)
  assert.deepEqual(flashes, [0, 1, 2], `player saw ${flashes.join(',')}`)
  assert.equal(m.phase, Phase.Input, 'never reached the input phase')
})

test('a correct sequence clears the round', () => {
  const m = machine()
  m.update(OPTS.graceS, true)
  run(m, 12)
  for (const pillar of [0, 1, 2]) m.answer(pillar)
  assert.equal(m.phase, Phase.Resolve)
  assert.equal(m.lastAnswerWasCorrect, true)
})

test('a wrong answer fails immediately, not at the end', () => {
  const m = machine()
  m.update(OPTS.graceS, true)
  run(m, 12)
  m.answer(0)
  m.answer(3) // expected 1
  assert.equal(m.phase, Phase.Resolve)
  assert.equal(m.lastAnswerWasCorrect, false)
})

test('a failed attempt restarts from the first round, never advances', () => {
  // The machine resets to Idle and then immediately restarts, because the player
  // is still standing at the pillar — which is the behaviour you want. So the
  // property worth pinning is the ROUND, not the phase: failing must never
  // promote you, and must not strand you either.
  const m = machine()
  m.update(OPTS.graceS, true)
  run(m, 12)

  // Clear round one legitimately, so we are demonstrably past the start.
  for (const p of [0, 1, 2]) m.answer(p)
  run(m, OPTS.resolveS + 0.5)
  run(m, 14)
  assert.equal(m.round, 2, 'never reached round two')

  // Now fail it.
  m.answer(99)
  assert.equal(m.lastAnswerWasCorrect, false)
  run(m, OPTS.resolveS + 0.5)

  assert.equal(m.round, 1, 'a failed round did not send the player back to the start')
  assert.equal(m.progress, 0)
})

test('taps during playback are ignored', () => {
  // Otherwise a player tapping early consumes steps of a sequence they have not
  // been shown yet, and fails a round they never got to attempt.
  const m = machine()
  m.update(OPTS.graceS, true)
  m.update(0.1, true)
  m.answer(0)
  m.answer(1)
  assert.equal(m.progress, 0, 'input was accepted during playback')
})

test('clearing every round earns the mark', () => {
  const m = machine()
  m.update(OPTS.graceS, true)
  for (let round = 0; round < OPTS.roundLengths.length; round++) {
    run(m, 14)
    assert.equal(m.phase, Phase.Input, `round ${round} never reached input`)
    for (let i = 0; i < m.sequenceLength; i++) m.answer(i % 4)
    run(m, OPTS.resolveS + 0.5)
  }
  assert.equal(m.hasEarnedMark, true, 'completing every round earned nothing')
})

test('the mark is spent once and not again', () => {
  const m = machine()
  m.update(OPTS.graceS, true)
  for (let round = 0; round < OPTS.roundLengths.length; round++) {
    run(m, 14)
    for (let i = 0; i < m.sequenceLength; i++) m.answer(i % 4)
    run(m, OPTS.resolveS + 0.5)
  }
  assert.equal(m.consumeMark(), true)
  assert.equal(m.consumeMark(), false, 'the same mark was spent twice')
})

test('rounds get longer', () => {
  const m = machine()
  m.update(OPTS.graceS, true)
  const lengths: number[] = []
  for (let round = 0; round < OPTS.roundLengths.length; round++) {
    run(m, 14)
    lengths.push(m.sequenceLength)
    for (let i = 0; i < m.sequenceLength; i++) m.answer(i % 4)
    run(m, OPTS.resolveS + 0.5)
  }
  assert.deepEqual(lengths, [...OPTS.roundLengths])
})

test('walking away abandons the attempt rather than pausing it', () => {
  // A puzzle that silently resumes mid-sequence when you wander back is worse
  // than one that restarts: the player is graded against something they were
  // shown minutes ago.
  const m = machine()
  m.update(OPTS.graceS, true)
  run(m, 12)
  assert.equal(m.phase, Phase.Input)
  m.update(0.1, false)
  assert.equal(m.phase, Phase.Idle)
  assert.equal(m.progress, 0)
})

test('an answer after walking away is ignored', () => {
  const m = machine()
  m.update(OPTS.graceS, true)
  run(m, 12)
  m.update(0.1, false)
  m.answer(0)
  assert.equal(m.progress, 0)
})

test('a cleared round lights every pillar; a failed one lights none', () => {
  const win = machine()
  win.update(OPTS.graceS, true)
  run(win, 12)
  for (const p of [0, 1, 2]) win.answer(p)
  assert.equal(win.litPillars().length, OPTS.pillarCount)

  const lose = machine()
  lose.update(OPTS.graceS, true)
  run(lose, 12)
  lose.answer(3)
  assert.equal(lose.litPillars().length, 0)
})

test('each attempt asks for a different sequence', () => {
  // Sequences derive from an attempt counter rather than Math.random, because a
  // sandbox that froze Math.random would serve one sequence forever — a bug no
  // typecheck would catch. This pins that the counter actually advances.
  const attempts: number[] = []
  const m = new EchoMachine({
    ...OPTS,
    makeSequence: (round, attempt, length) => {
      attempts.push(attempt)
      return Array.from({ length }, (_, i) => (attempt + i) % 4)
    }
  })

  m.update(OPTS.graceS, true)
  for (let i = 0; i < 3; i++) {
    run(m, 12)
    m.answer(99)                       // deliberately wrong -> resets
    run(m, OPTS.resolveS + 0.5)
    m.update(0.1, true)                // approach again
  }

  assert.ok(attempts.length >= 3, `only ${attempts.length} attempts were generated`)
  assert.equal(new Set(attempts).size, attempts.length, `attempt counter repeated: ${attempts.join(',')}`)
})
