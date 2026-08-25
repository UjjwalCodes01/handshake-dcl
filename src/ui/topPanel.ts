/**
 * Which single panel occupies the top of the screen.
 *
 * Pure, so the ordering can be executed rather than trusted.
 *
 * Each element used to carry its own growing list of negations
 * (`!waking && !showingAnswered && !puzzleActive && ...`), so adding a tenth
 * meant editing six others, and any omission put two panels on screen at once.
 * Two were only mutually exclusive BY GEOMETRY — the roll and the puzzle would
 * have overlapped the moment anyone tuned ROLL_RANGE_M or the pillar radius.
 *
 * Returning a single value makes "exactly one panel" true by construction, and
 * this is the only place the priority lives.
 */
export type TopPanel = 'waking' | 'puzzle' | 'answered' | 'roll' | 'reading' | 'first' | 'waiting' | 'none'

export type PanelInputs = {
  /** The server has not answered yet. */
  waking: boolean
  /** A sequence is playing or being answered. */
  puzzleActive: boolean
  /** Hands this player left were answered while they were away. */
  showingAnswered: boolean
  /** Standing at the anchor, and somebody is on the roll. */
  atAnchorWithRoll: boolean
  /** Standing close enough to a link to read who made it. */
  reading: boolean
  /** Nothing has ever happened in this world. */
  isFirstEver: boolean
  /** A hand is out and there is nothing else to do. */
  hasHandOutIdle: boolean
}

export function resolveTopPanel(input: PanelInputs): TopPanel {
  // The server is not up. Nothing else on screen means anything yet.
  if (input.waking) return 'waking'
  // Mid-puzzle: interrupting a sequence the player is watching breaks it.
  if (input.puzzleActive) return 'puzzle'
  // Transient, and only on return — the single strongest reason to come back.
  if (input.showingAnswered) return 'answered'
  // Positional and deliberate: you walked to the anchor to see this.
  if (input.atAnchorWithRoll) return 'roll'
  if (input.reading) return 'reading'
  if (input.isFirstEver) return 'first'
  if (input.hasHandOutIdle) return 'waiting'
  return 'none'
}
