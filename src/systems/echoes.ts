import { engine, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { ECHOES } from '../config'
import { createPillars, getPillarPosition, setAllPillarsLit, setPillarLit } from '../entities/pillars'
import { hashString } from '../hash'
import { getSelfAddress } from '../net/identity'

/**
 * The solo puzzle. Four pillars flash a sequence; the player walks to each in
 * turn and answers it. Three rounds of increasing length earn a permanent mark
 * on the next hand they leave.
 *
 * Entirely client-side and single-player. There is no shared state, so nothing
 * here is synced and nothing costs network budget.
 *
 * The reward is deliberately cosmetic and deliberately NOT server-validated. A
 * modified client could claim the mark without solving anything — but it buys
 * no advantage, affects no one else's experience, and cannot forge a handshake.
 * Validating it server-side would mean replaying the whole puzzle on the server
 * to guard a colour change, which is not a trade worth making. Anything that
 * actually matters (links, hands, counts) remains server-authoritative.
 */

/**
 * Phases of the puzzle.
 *
 * A plain frozen object rather than a `const enum`. Enums GENERATE code, and
 * this project is constrained to erasable-only TypeScript so every module stays
 * loadable by Node's strip-only runtime — which is what makes the logic
 * testable outside the QuickJS sandbox. `erasableSyntaxOnly` in tsconfig
 * enforces it.
 */
const Phase = {
  /** Nobody is near; nothing is running. */
  Idle: 0,
  /** Pause before playback so the player can look up. */
  LeadIn: 1,
  /** Flashing the sequence. */
  Playback: 2,
  /** Waiting for the player to answer. */
  Input: 3,
  /** Brief hold after a right or wrong answer. */
  Resolve: 4
} as const

type Phase = (typeof Phase)[keyof typeof Phase]

let phase: Phase = Phase.Idle
let round = 0
let sequence: number[] = []
/** How far through the sequence the player has answered correctly. */
let progress = 0
/** Index into `sequence` currently being flashed. */
let playbackIndex = 0
let flashOn = false
let timer = 0
let lastResultOk = false
let earnedMark = false

let reachablePillar = -1
/** Seconds since the scene started, so the puzzle cannot ambush an arrival. */
let sinceStart = 0

export function getReachablePillar(): number {
  return reachablePillar
}

/** True while the player should be answering, so the HUD can offer the action. */
export function isAwaitingInput(): boolean {
  return phase === Phase.Input
}

/** True while the sequence is playing — the moment to watch, not act. */
export function isPlayingBack(): boolean {
  return phase === Phase.LeadIn || phase === Phase.Playback
}

export function isResolving(): boolean {
  return phase === Phase.Resolve
}

export function lastAnswerWasCorrect(): boolean {
  return lastResultOk
}

/** Round the player is on, 1-based, for a wordless progress readout. */
export function getRound(): number {
  return round + 1
}

export function getTotalRounds(): number {
  return ECHOES.ROUND_LENGTHS.length
}

/** How many steps of the current sequence are already answered. */
export function getProgress(): number {
  return progress
}

export function getSequenceLength(): number {
  return sequence.length
}

/** True once the puzzle has been solved this session. */
export function hasEarnedMark(): boolean {
  return earnedMark
}

/** Consumed by the server request when a marked hand is left. */
export function consumeMark(): boolean {
  if (!earnedMark) return false
  earnedMark = false
  return true
}

export function setupEchoes(): void {
  createPillars()
}

/** Increments per attempt so a replay never repeats the previous sequence. */
let attempt = 0

/**
 * Builds a sequence by hashing, not by Math.random().
 *
 * The scene runtime is a QuickJS sandbox, and sandboxes sometimes stub or
 * freeze Math.random for determinism. If that happened here the puzzle would
 * silently serve the same sequence forever — a failure that would never show up
 * in a typecheck and might not be obvious on a quick playthrough either.
 * Hashing depends only on arithmetic, which cannot be taken away, and mixing in
 * the player's own address keeps sequences different between players.
 */
function buildSequence(length: number): number[] {
  const salt = getSelfAddress()
  const out: number[] = []
  for (let i = 0; i < length; i++) {
    const h = hashString(`${salt}|${attempt}|${round}|${i}`)
    out.push(h % ECHOES.PILLAR_COUNT)
  }
  return out
}

function startRound(index: number): void {
  attempt += 1
  round = Math.min(index, ECHOES.ROUND_LENGTHS.length - 1)
  sequence = buildSequence(ECHOES.ROUND_LENGTHS[round])
  progress = 0
  playbackIndex = 0
  flashOn = false
  timer = 0
  phase = Phase.LeadIn
  setAllPillarsLit(false)
}

function reset(): void {
  phase = Phase.Idle
  round = 0
  sequence = []
  progress = 0
  playbackIndex = 0
  flashOn = false
  timer = 0
  setAllPillarsLit(false)
}

/**
 * Called by the UI when the player answers the pillar they are standing at.
 */
export function answerPillar(): void {
  if (phase !== Phase.Input) return
  if (reachablePillar < 0) return

  const expected = sequence[progress]
  if (reachablePillar === expected) {
    progress += 1
    if (progress >= sequence.length) {
      // Round cleared.
      lastResultOk = true
      phase = Phase.Resolve
      timer = 0
      setAllPillarsLit(true)
      if (round + 1 >= ECHOES.ROUND_LENGTHS.length) earnedMark = true
    }
    return
  }

  // Wrong pillar — back to the first round.
  lastResultOk = false
  phase = Phase.Resolve
  timer = 0
  setAllPillarsLit(false)
}

/**
 * Drives the puzzle. Called from the throttled tick, never per frame.
 */
export function echoesSystem(dt: number): void {
  sinceStart += dt

  // Work out which pillar the player can answer.
  const selfTransform = Transform.getOrNull(engine.PlayerEntity)
  reachablePillar = -1
  let nearestDistSq = ECHOES.REACH_M * ECHOES.REACH_M

  if (selfTransform) {
    const selfPos = selfTransform.position
    for (let i = 0; i < ECHOES.PILLAR_COUNT; i++) {
      const position = getPillarPosition(i)
      if (!position) continue
      // Horizontal only: the pillars are short and the player stands on the
      // ground, so height would just bias every test by a constant.
      const dx = selfPos.x - position.x
      const dz = selfPos.z - position.z
      const distSq = dx * dx + dz * dz
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq
        reachablePillar = i
      }
    }
  }

  const nearRing = reachablePillar >= 0

  switch (phase) {
    case Phase.Idle:
      // Walking up to a pillar starts it. No prompt, no button to find —
      // approaching IS the interaction. The grace period keeps a player who
      // happens to arrive next to a pillar from being hijacked before they have
      // even seen the lattice.
      if (nearRing && sinceStart >= ECHOES.GRACE_S) startRound(0)
      return

    case Phase.LeadIn:
      if (!nearRing) return reset()
      timer += dt
      if (timer >= ECHOES.LEAD_IN_S) {
        timer = 0
        playbackIndex = 0
        flashOn = true
        setPillarLit(sequence[0], true)
        phase = Phase.Playback
      }
      return

    case Phase.Playback: {
      if (!nearRing) return reset()
      timer += dt
      const limit = flashOn ? ECHOES.FLASH_ON_S : ECHOES.FLASH_GAP_S
      if (timer < limit) return
      timer = 0

      if (flashOn) {
        setPillarLit(sequence[playbackIndex], false)
        flashOn = false
        playbackIndex += 1
        if (playbackIndex >= sequence.length) {
          phase = Phase.Input
          progress = 0
        }
        return
      }

      setPillarLit(sequence[playbackIndex], true)
      flashOn = true
      return
    }

    case Phase.Input:
      // Leaving the ring abandons the attempt rather than leaving the puzzle
      // half-finished for whenever the player wanders back.
      if (!nearRing) reset()
      return

    case Phase.Resolve:
      timer += dt
      if (timer < ECHOES.RESOLVE_S) return
      timer = 0
      setAllPillarsLit(false)
      if (!lastResultOk) return reset()
      if (round + 1 >= ECHOES.ROUND_LENGTHS.length) {
        // Solved outright. Idle so it can be played again.
        reset()
        return
      }
      startRound(round + 1)
      return
  }
}

/** Test seam / teardown. */
export function resetEchoes(): void {
  reset()
  earnedMark = false
  sinceStart = 0
}
