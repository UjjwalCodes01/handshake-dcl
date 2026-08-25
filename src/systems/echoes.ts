import { engine, Transform } from '@dcl/sdk/ecs'
import { ECHOES } from '../config'
import { createPillars, getPillarPosition, setAllPillarsLit, setPillarLit } from '../entities/pillars'
import { hashString } from '../hash'
import { getSelfAddress } from '../net/identity'
import { EchoMachine } from './echoMachine'

/**
 * SDK-facing shell for the Echoes puzzle.
 *
 * All the state and every transition live in ./echoMachine, which is pure and
 * tested. This file does only the three things that need the engine: work out
 * whether the player is standing at a pillar, drive the machine, and apply the
 * lighting the machine asks for.
 *
 * The reward is deliberately cosmetic and NOT server-validated. A modified
 * client could claim the mark without solving anything, but it buys no
 * advantage, changes nobody else's experience, and cannot forge a handshake.
 * Validating it would mean replaying the whole puzzle server-side to guard a
 * colour change. Everything that actually matters stays server-authoritative.
 */

/**
 * Sequences come from hashing, not Math.random().
 *
 * The scene runs in a QuickJS sandbox, and sandboxes sometimes stub or freeze
 * Math.random for determinism. If that happened the puzzle would silently serve
 * one sequence forever — a failure no typecheck would catch and one easy to miss
 * in a quick playthrough. Hashing depends only on arithmetic, and mixing in the
 * player's own address keeps sequences different between players.
 */
function makeSequence(round: number, attempt: number, length: number): number[] {
  const salt = getSelfAddress()
  const out: number[] = []
  for (let i = 0; i < length; i++) {
    out.push(hashString(`${salt}|${attempt}|${round}|${i}`) % ECHOES.PILLAR_COUNT)
  }
  return out
}

const machine = new EchoMachine({
  pillarCount: ECHOES.PILLAR_COUNT,
  roundLengths: ECHOES.ROUND_LENGTHS,
  leadInS: ECHOES.LEAD_IN_S,
  flashOnS: ECHOES.FLASH_ON_S,
  flashGapS: ECHOES.FLASH_GAP_S,
  resolveS: ECHOES.RESOLVE_S,
  graceS: ECHOES.GRACE_S,
  makeSequence
})

let reachablePillar = -1
/** Last lighting applied, so pillars are only rewritten when it changes. */
let appliedLit = ''

export function getReachablePillar(): number {
  return reachablePillar
}
export function isAwaitingInput(): boolean {
  return machine.isAwaitingInput
}
export function isPlayingBack(): boolean {
  return machine.isPlayingBack
}
export function isResolving(): boolean {
  return machine.isResolving
}
export function lastAnswerWasCorrect(): boolean {
  return machine.lastAnswerWasCorrect
}
export function getRound(): number {
  return machine.round
}
export function getTotalRounds(): number {
  return machine.totalRounds
}
export function getProgress(): number {
  return machine.progress
}
export function getSequenceLength(): number {
  return machine.sequenceLength
}
export function hasEarnedMark(): boolean {
  return machine.hasEarnedMark
}
export function consumeMark(): boolean {
  return machine.consumeMark()
}

/** Called by the UI when the player answers the pillar they are standing at. */
export function answerPillar(): void {
  machine.answer(reachablePillar)
}

export function setupEchoes(): void {
  createPillars()
}

/** Applies whatever lighting the machine currently asks for, only on change. */
function applyLighting(): void {
  const lit = machine.litPillars()
  const key = lit.join(',')
  if (key === appliedLit) return
  appliedLit = key

  if (lit.length === ECHOES.PILLAR_COUNT) {
    setAllPillarsLit(true)
    return
  }
  for (let i = 0; i < ECHOES.PILLAR_COUNT; i++) {
    setPillarLit(i, lit.includes(i))
  }
}

/** Drives the puzzle. Called from the throttled tick, never per frame. */
export function echoesSystem(dt: number): void {
  // Which pillar can the player answer right now?
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

  machine.update(dt, reachablePillar >= 0)
  applyLighting()
}

/** Test seam / teardown. */
export function resetEchoes(): void {
  machine.resetAll()
  reachablePillar = -1
  appliedLit = ''
}
