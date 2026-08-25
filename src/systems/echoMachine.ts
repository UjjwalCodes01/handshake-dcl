/**
 * The Echoes puzzle, as a pure state machine.
 *
 * Separated from the SDK so the phase transitions can actually be executed.
 * Five phases driven by timers and player input is the kind of logic that looks
 * obviously correct and quietly is not — an off-by-one in playback shows the
 * player a different sequence from the one they are graded against, and the
 * puzzle becomes unwinnable with nothing to indicate why.
 *
 * Lighting is REPORTED, not performed: `litPillars()` says what should be lit
 * and the caller does it. That keeps every rendering concern out of here.
 */

export const Phase = {
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

export type Phase = (typeof Phase)[keyof typeof Phase]

export type EchoOptions = {
  pillarCount: number
  roundLengths: readonly number[]
  leadInS: number
  flashOnS: number
  flashGapS: number
  resolveS: number
  /** Seconds after arrival before the puzzle may start. */
  graceS: number
  /** Injected so tests are deterministic; production hashes the player address. */
  makeSequence: (round: number, attempt: number, length: number) => number[]
}

export class EchoMachine {
  private readonly options: EchoOptions

  private phaseValue: Phase = Phase.Idle
  private roundIndex = 0
  private sequence: number[] = []
  private progressValue = 0
  private playbackIndex = 0
  private flashOn = false
  private timer = 0
  private attempt = 0
  private lastOk = false
  private earned = false
  private sinceStart = 0

  constructor(options: EchoOptions) {
    this.options = options
  }

  get phase(): Phase {
    return this.phaseValue
  }
  get round(): number {
    return this.roundIndex + 1
  }
  get totalRounds(): number {
    return this.options.roundLengths.length
  }
  get progress(): number {
    return this.progressValue
  }
  get sequenceLength(): number {
    return this.sequence.length
  }
  get lastAnswerWasCorrect(): boolean {
    return this.lastOk
  }
  get hasEarnedMark(): boolean {
    return this.earned
  }

  /** Spent when the player leaves a hand, so the mark travels into the world. */
  consumeMark(): boolean {
    if (!this.earned) return false
    this.earned = false
    return true
  }

  /**
   * Which pillars should be lit right now.
   *
   * Reported rather than performed, so this file never touches a renderer.
   */
  litPillars(): number[] {
    if (this.phaseValue === Phase.Playback && this.flashOn) {
      const pillar = this.sequence[this.playbackIndex]
      return pillar === undefined ? [] : [pillar]
    }
    // A cleared round lights everything; a wrong answer darkens everything.
    if (this.phaseValue === Phase.Resolve && this.lastOk) {
      return Array.from({ length: this.options.pillarCount }, (_, i) => i)
    }
    return []
  }

  /** True while the player should be watching rather than acting. */
  get isPlayingBack(): boolean {
    return this.phaseValue === Phase.LeadIn || this.phaseValue === Phase.Playback
  }
  get isAwaitingInput(): boolean {
    return this.phaseValue === Phase.Input
  }
  get isResolving(): boolean {
    return this.phaseValue === Phase.Resolve
  }

  /**
   * The player answered a pillar.
   *
   * Ignored outside the input phase, so a tap landing during playback cannot
   * consume a step the player never saw.
   */
  answer(pillar: number): void {
    if (this.phaseValue !== Phase.Input) return
    if (pillar < 0) return

    if (pillar !== this.sequence[this.progressValue]) {
      this.lastOk = false
      this.phaseValue = Phase.Resolve
      this.timer = 0
      return
    }

    this.progressValue += 1
    if (this.progressValue < this.sequence.length) return

    this.lastOk = true
    this.phaseValue = Phase.Resolve
    this.timer = 0
    if (this.roundIndex + 1 >= this.options.roundLengths.length) this.earned = true
  }

  /**
   * Advances the machine.
   *
   * `nearRing` is whether the player is standing at a pillar. Leaving abandons
   * the attempt rather than leaving it half-finished for whenever they wander
   * back — a puzzle that silently resumes mid-sequence is worse than one that
   * restarts.
   */
  update(dt: number, nearRing: boolean): void {
    this.sinceStart += dt

    switch (this.phaseValue) {
      case Phase.Idle:
        // Approaching IS the interaction: no prompt, no button to discover. The
        // grace period stops a player who happens to arrive beside a pillar
        // being hijacked before they have seen anything else.
        if (nearRing && this.sinceStart >= this.options.graceS) this.startRound(0)
        return

      case Phase.LeadIn:
        if (!nearRing) return this.reset()
        this.timer += dt
        if (this.timer >= this.options.leadInS) {
          this.timer = 0
          this.playbackIndex = 0
          this.flashOn = true
          this.phaseValue = Phase.Playback
        }
        return

      case Phase.Playback: {
        if (!nearRing) return this.reset()
        this.timer += dt
        const limit = this.flashOn ? this.options.flashOnS : this.options.flashGapS
        if (this.timer < limit) return
        this.timer = 0

        if (this.flashOn) {
          this.flashOn = false
          this.playbackIndex += 1
          if (this.playbackIndex >= this.sequence.length) {
            this.phaseValue = Phase.Input
            this.progressValue = 0
          }
          return
        }
        this.flashOn = true
        return
      }

      case Phase.Input:
        if (!nearRing) this.reset()
        return

      case Phase.Resolve:
        this.timer += dt
        if (this.timer < this.options.resolveS) return
        this.timer = 0
        if (!this.lastOk) return this.reset()
        if (this.roundIndex + 1 >= this.options.roundLengths.length) {
          // Solved outright. Back to idle so it can be played again.
          this.reset()
          return
        }
        this.startRound(this.roundIndex + 1)
        return
    }
  }

  private startRound(index: number): void {
    this.attempt += 1
    this.roundIndex = Math.min(index, this.options.roundLengths.length - 1)
    this.sequence = this.options.makeSequence(
      this.roundIndex,
      this.attempt,
      this.options.roundLengths[this.roundIndex]
    )
    this.progressValue = 0
    this.playbackIndex = 0
    this.flashOn = false
    this.timer = 0
    this.phaseValue = Phase.LeadIn
  }

  private reset(): void {
    this.phaseValue = Phase.Idle
    this.roundIndex = 0
    this.sequence = []
    this.progressValue = 0
    this.playbackIndex = 0
    this.flashOn = false
    this.timer = 0
  }

  /** Test seam. */
  resetAll(): void {
    this.reset()
    this.earned = false
    this.sinceStart = 0
  }
}
