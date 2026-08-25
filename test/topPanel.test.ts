import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveTopPanel } from '../src/ui/topPanel.ts'
import type { PanelInputs, TopPanel } from '../src/ui/topPanel.ts'

const NONE: PanelInputs = {
  waking: false,
  puzzleActive: false,
  showingAnswered: false,
  atAnchorWithRoll: false,
  reading: false,
  isFirstEver: false,
  hasHandOutIdle: false
}

const ALL: PanelInputs = {
  waking: true,
  puzzleActive: true,
  showingAnswered: true,
  atAnchorWithRoll: true,
  reading: true,
  isFirstEver: true,
  hasHandOutIdle: true
}

/** Priority order, strongest first. */
const ORDER: Array<[keyof PanelInputs, TopPanel]> = [
  ['waking', 'waking'],
  ['puzzleActive', 'puzzle'],
  ['showingAnswered', 'answered'],
  ['atAnchorWithRoll', 'roll'],
  ['reading', 'reading'],
  ['isFirstEver', 'first'],
  ['hasHandOutIdle', 'waiting']
]

test('nothing applies means nothing is shown', () => {
  assert.equal(resolveTopPanel(NONE), 'none')
})

test('every panel is reachable', () => {
  // Catches a condition that can never win — dead UI that looks implemented,
  // renders in review, and is invisible in play.
  for (const [flag, expected] of ORDER) {
    assert.equal(resolveTopPanel({ ...NONE, [flag]: true }), expected, `${expected} can never show`)
  }
})

test('priority is strict: each panel beats everything below it', () => {
  // With every condition true, the strongest must win; removing it must promote
  // exactly the next one. This is the whole ordering, checked end to end.
  const inputs = { ...ALL }
  for (const [flag, expected] of ORDER) {
    assert.equal(resolveTopPanel(inputs), expected, `expected ${expected} to win`)
    inputs[flag] = false
  }
  assert.equal(resolveTopPanel(inputs), 'none', 'something survived after every flag was cleared')
})

test('the waking indicator suppresses everything', () => {
  // Before the server answers, the rest of the screen is reporting stale or
  // empty state; showing it alongside "connecting" would read as broken.
  assert.equal(resolveTopPanel({ ...ALL, waking: true }), 'waking')
})

test('an active puzzle is never interrupted', () => {
  // A sequence the player is watching must not be covered mid-flash, or they
  // are graded on something they were shown half of.
  assert.equal(
    resolveTopPanel({ ...ALL, waking: false, puzzleActive: true }),
    'puzzle'
  )
})

test('a returning player is told they were answered before anything positional', () => {
  // It lasts six seconds and only ever fires on return. The roll and the link
  // readout are always available wherever the player is standing.
  assert.equal(
    resolveTopPanel({ ...NONE, showingAnswered: true, atAnchorWithRoll: true, reading: true }),
    'answered'
  )
})

test('the roll and the puzzle can never share the screen', () => {
  // They are currently exclusive by GEOMETRY — you cannot stand at the anchor
  // and at a pillar at once — which would silently stop being true if anyone
  // tuned ROLL_RANGE_M or ECHOES.RADIUS_M. This makes it true by construction.
  assert.equal(resolveTopPanel({ ...NONE, puzzleActive: true, atAnchorWithRoll: true }), 'puzzle')
})

test('exactly one panel is chosen for every possible combination', () => {
  // 2^7 = 128 combinations. A single return value makes this true by
  // construction; the test pins it against a future refactor to a list.
  const valid = new Set<TopPanel>(['waking', 'puzzle', 'answered', 'roll', 'reading', 'first', 'waiting', 'none'])
  const keys = Object.keys(NONE) as Array<keyof PanelInputs>
  for (let mask = 0; mask < 1 << keys.length; mask++) {
    const input = { ...NONE }
    keys.forEach((k, i) => {
      input[k] = Boolean(mask & (1 << i))
    })
    const result = resolveTopPanel(input)
    assert.ok(valid.has(result), `unexpected panel ${result}`)
  }
})
