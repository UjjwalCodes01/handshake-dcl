import ReactEcs, { Label, ReactEcsRenderer, ScreenInsetArea, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { COLORS } from '../config'
import { getSelfAddress } from '../net/identity'
import { getEngagedAddress } from '../systems/proximity'
import { isPairOnCooldown, offerHandshake } from '../systems/handshake'
import { getLinkReading, getTotalHandshakes, isLinkedWith } from '../systems/lattice'
import {
  completeReachableHand,
  extendHand,
  getPendingCount,
  getReachableOwnerName,
  getReachableSlot,
  isSlotInFlight
} from '../systems/pendingHands'
import { shortAge } from './relativeTime'
import {
  answerPillar,
  getProgress,
  getRound,
  getSequenceLength,
  getTotalRounds,
  hasEarnedMark,
  isAwaitingInput,
  isPlayingBack,
  isResolving,
  lastAnswerWasCorrect,
  getReachablePillar
} from '../systems/echoes'
import { getAnsweredWhileAway, isConnected, isWaking, markHandExtended, playerHasHandOut } from '../net/session'

let flashUntil = 0

export function flashSuccess(durationMs = 1400): void {
  flashUntil = Date.now() + durationMs
}

/**
 * Glyphs live here as real string constants, never inline as JSX attribute
 * strings. JSX does NOT process escape sequences inside attribute quotes, so
 * value="\u{1F91D}" renders the literal characters rather than the emoji.
 */
const GLYPH_HANDSHAKE = '\u{1F91D}'
const GLYPH_HAND_OUT = '\u{270B}'
const GLYPH_WAITING = '\u{1F464}\u{2026}'
const GLYPH_WAKING = '\u{1F310}'
const GLYPH_FIRST = '\u{2728}'
/** Stands in for a participant whose name we never learned (typically a guest). */
const GLYPH_ANON = '\u{2022}\u{2022}\u{2022}'
const GLYPH_ECHO = '\u{25C9}'
const GLYPH_WATCH = '\u{1F441}'
const GLYPH_WIN = '\u{2714}'
const GLYPH_LOSE = '\u{2716}'
const GLYPH_MARK = '\u{2726}'
/** Filled/empty pips for wordless progress. */
const PIP_FULL = '\u{25CF}'
const PIP_EMPTY = '\u{25CB}'

/**
 * Everything below memoises its output string.
 *
 * react-ecs re-evaluates the renderer roughly every frame, so a template literal
 * written inline here allocates a fresh string ~60 times a second whether or not
 * anything changed. Individually tiny; collectively a steady stream of garbage
 * inside a QuickJS heap, which surfaces as frame hitches on precisely the
 * low-end phones that matter most (AGENTS.md priority #1).
 *
 * Each helper keeps its last inputs and rebuilds only when they actually differ.
 */

const pipCache = new Map<number, string>()

function pips(done: number, total: number): string {
  // done and total are both tiny, so one integer key covers every combination.
  const key = done * 100 + total
  const cached = pipCache.get(key)
  if (cached !== undefined) return cached

  let out = ''
  for (let i = 0; i < total; i++) out += i < done ? PIP_FULL : PIP_EMPTY
  pipCache.set(key, out)
  return out
}

let counterMarked = false
let counterCount = -1
let counterText = ''
function counterLabel(marked: boolean, count: number): string {
  if (marked !== counterMarked || count !== counterCount) {
    counterMarked = marked
    counterCount = count
    counterText = marked ? `${GLYPH_MARK} ${GLYPH_HANDSHAKE} ${count}` : `${GLYPH_HANDSHAKE} ${count}`
  }
  return counterText
}

let puzzleKey = ''
let puzzleText = ''
let puzzleA = -1
let puzzleB = -1
function puzzleLabel(mode: string, a: number, b: number): string {
  if (mode !== puzzleKey || a !== puzzleA || b !== puzzleB) {
    puzzleKey = mode
    puzzleA = a
    puzzleB = b
    puzzleText =
      mode === 'win' ? `${GLYPH_WIN} ${pips(a, b)}`
      : mode === 'lose' ? GLYPH_LOSE
      : mode === 'watch' ? `${GLYPH_WATCH} ${pips(a, b)}`
      : `${GLYPH_ECHO} ${pips(a, b)}`
  }
  return puzzleText
}

let readingA = ''
let readingB = ''
let readingAge = ''
let readingText = ''
function readingLabel(aName: string, bName: string, age: string): string {
  if (aName !== readingA || bName !== readingB || age !== readingAge) {
    readingA = aName
    readingB = bName
    readingAge = age
    readingText = `${aName || GLYPH_ANON} ${GLYPH_HANDSHAKE} ${bName || GLYPH_ANON}  ${age}`
  }
  return readingText
}

let answeredCount = -1
let answeredText = ''
function answeredLabel(count: number): string {
  if (count !== answeredCount) {
    answeredCount = count
    answeredText = `${GLYPH_HANDSHAKE} +${count}`
  }
  return answeredText
}

/** Hoisted so the waking label is not rebuilt every frame. */
const WAKING_TEXT = `${GLYPH_WAKING} ${GLYPH_WAITING}`

const ACCENT = Color4.create(COLORS.LINK_FRESH.r, COLORS.LINK_FRESH.g, COLORS.LINK_FRESH.b, 1)
const IDLE = Color4.create(COLORS.LINK.r, COLORS.LINK.g, COLORS.LINK.b, 1)
const PANEL = Color4.create(0.05, 0.06, 0.09, 0.72)
const WHITE = Color4.White()
const BLACK = Color4.Black()
const FAIL = Color4.create(1, 0.5, 0.5, 1)

type ActionData = {
  glyph: string
  tint: Color4
  onTap: () => void
  /**
   * Who this action is with. Shown above the button so the player knows they are
   * answering a specific person rather than pressing a generic game button —
   * that is the entire social premise, and it has to survive having no text.
   * Empty for guests and for players whose name we have not learned.
   */
  caption: string
}

type Action = ActionData | null

/**
 * Decides the single thing the player can do right now.
 *
 * Exactly one action is ever offered. A phone screen with two competing buttons
 * is a phone screen a judge misreads in the ninety seconds they give it, and
 * AGENTS.md §6 is explicit that a single tap must be the whole interaction
 * vocabulary. Priority runs live player > waiting hand > leave your own hand,
 * because a live handshake is the rarest and most valuable of the three.
 */
/** Hoisted so the extend-hand branch does not build a closure every frame. */
function onExtendTap(): void {
  markHandExtended()
  extendHand()
}

/**
 * Reused across renders to avoid allocating a new action object every frame.
 * Safe because the value is consumed by the render that requested it and never
 * retained.
 */
const scratchAction: ActionData = { glyph: '', tint: IDLE, onTap: onExtendTap, caption: '' }

function act(glyph: string, tint: Color4, onTap: () => void, caption: string): ActionData {
  scratchAction.glyph = glyph
  scratchAction.tint = tint
  scratchAction.onTap = onTap
  scratchAction.caption = caption
  return scratchAction
}

function resolveAction(self: string): Action {
  if (!self) return null

  const partner = getEngagedAddress()
  if (partner && !isPairOnCooldown(self, partner) && !isLinkedWith(self, partner)) {
    return act(GLYPH_HANDSHAKE, ACCENT, offerHandshake, '')
  }

  const slot = getReachableSlot()
  if (slot >= 0 && !isSlotInFlight(slot)) {
    return act(GLYPH_HANDSHAKE, IDLE, completeReachableHand, getReachableOwnerName())
  }

  // Answering an echo pillar. Ranked above leaving a hand because the player is
  // mid-interaction and interrupting that would feel broken; ranked below the
  // social actions because those are the point of the scene.
  if (isAwaitingInput() && getReachablePillar() >= 0) {
    return act(GLYPH_ECHO, IDLE, answerPillar, '')
  }

  if (!playerHasHandOut() && isConnected()) {
    return act(GLYPH_HAND_OUT, IDLE, onExtendTap, '')
  }

  return null
}

/**
 * The entire on-screen UI.
 *
 * Mobile layout rules from AGENTS.md §6 are structural here, not cosmetic:
 *  - Nothing sits on the LEFT edge (movement joystick) or in the BOTTOM-RIGHT
 *    corner (chat / profile / interact). Those belong to the mobile client and
 *    anything drawn there is unusable.
 *  - The action target is oversized, far above the ~44px minimum, because it is
 *    the only thing a player ever taps.
 *  - Elements are RETURNED only when actionable. Hidden-but-mounted UI still
 *    costs performance (§6), so unmounting is the cheap path.
 *  - No text is required to understand any of it.
 */
const Hud = () => {
  const self = getSelfAddress()
  const flashing = Date.now() < flashUntil
  const action = resolveAction(self)
  const waking = isWaking()
  const reading = getLinkReading()
  // Nobody has ever completed a handshake here and no hands are waiting. The
  // player is genuinely first — which deserves to feel like an event rather
  // than an empty room.
  const isFirstEver = isConnected() && getTotalHandshakes() === 0 && getPendingCount() === 0
  const watching = isPlayingBack()
  const resolving = isResolving()
  const puzzleActive = watching || resolving || isAwaitingInput()

  // Purely a read. The banner's lifetime is owned by sessionTick, so the
  // renderer stays free of side effects.
  const answered = getAnsweredWhileAway()
  const showingAnswered = answered > 0

  return (
    <ScreenInsetArea>
      <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>
        {/* Counter — TOP CENTRE. Safe on every device. */}
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: '4%', left: '25%' },
            width: '50%',
            height: '9%',
            justifyContent: 'center',
            alignItems: 'center'
          }}
          uiBackground={{ color: PANEL }}
        >
          <Label
            value={counterLabel(hasEarnedMark(), getTotalHandshakes())}
            fontSize={34}
            color={flashing ? ACCENT : WHITE}
            textAlign="middle-center"
          />
        </UiEntity>

        {/* World waking up — TOP CENTRE.
            The Multiplayer Server cold-starts in ~15 s when nobody has visited
            recently, and a judge opening an empty world IS that cold start.
            Without this the scene just looks broken for fifteen seconds, which
            is most of the attention it will ever get. */}
        {waking ? (
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { top: '15%', left: '30%' },
              width: '40%',
              height: '8%',
              justifyContent: 'center',
              alignItems: 'center'
            }}
            uiBackground={{ color: PANEL }}
          >
            <Label value={WAKING_TEXT} fontSize={28} color={WHITE} textAlign="middle-center" />
          </UiEntity>
        ) : null}

        {/* Echo puzzle readout — TOP CENTRE.
            Watch-vs-answer is shown by icon alone, and progress by pips, so the
            whole loop is legible without a word of text in any language. */}
        {puzzleActive && !waking ? (
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { top: '15%', left: '22%' },
              width: '56%',
              height: '8%',
              justifyContent: 'center',
              alignItems: 'center'
            }}
            uiBackground={{ color: PANEL }}
          >
            <Label
              value={
                resolving
                  ? lastAnswerWasCorrect()
                    ? puzzleLabel('win', getRound(), getTotalRounds())
                    : puzzleLabel('lose', 0, 0)
                  : watching
                    ? puzzleLabel('watch', getRound(), getTotalRounds())
                    : puzzleLabel('input', getProgress(), getSequenceLength())
              }
              fontSize={28}
              color={resolving && !lastAnswerWasCorrect() ? FAIL : ACCENT}
              textAlign="middle-center"
            />
          </UiEntity>
        ) : null}

        {/* Reading a link — who made it, and how long ago. TOP CENTRE.
            This is the solo player's content: the lattice is a record of real
            people, browsable on foot with nobody else online. */}
        {reading !== null && !waking && !showingAnswered && !puzzleActive ? (
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { top: '15%', left: '15%' },
              width: '70%',
              height: '8%',
              justifyContent: 'center',
              alignItems: 'center'
            }}
            uiBackground={{ color: PANEL }}
          >
            <Label
              value={readingLabel(reading.aName, reading.bName, shortAge(reading.createdAt, Date.now()))}
              fontSize={24}
              color={reading.live ? ACCENT : WHITE}
              textAlign="middle-center"
            />
          </UiEntity>
        ) : null}

        {/* First ever visitor — nothing has happened here yet. */}
        {isFirstEver && !waking && reading === null && !puzzleActive ? (
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { top: '15%', left: '30%' },
              width: '40%',
              height: '8%',
              justifyContent: 'center',
              alignItems: 'center'
            }}
            uiBackground={{ color: PANEL }}
          >
            <Label value={GLYPH_FIRST} fontSize={32} color={ACCENT} textAlign="middle-center" />
          </UiEntity>
        ) : null}

        {/* "You were answered while away" — TOP CENTRE, below the counter.
            The single strongest reason to come back, so it is the first thing
            shown on return, wordlessly. */}
        {showingAnswered && !waking && !puzzleActive ? (
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { top: '15%', left: '28%' },
              width: '44%',
              height: '8%',
              justifyContent: 'center',
              alignItems: 'center'
            }}
            uiBackground={{ color: PANEL }}
          >
            <Label value={answeredLabel(answered)} fontSize={30} color={ACCENT} textAlign="middle-center" />
          </UiEntity>
        ) : null}

        {/* Waiting indicator — shown only while we have a hand out and nothing
            else to do, so a solo player still sees their own contribution. */}
        {action === null && !waking && !showingAnswered && reading === null && !puzzleActive && playerHasHandOut() ? (
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { top: '15%', left: '30%' },
              width: '40%',
              height: '7%',
              justifyContent: 'center',
              alignItems: 'center'
            }}
            uiBackground={{ color: PANEL }}
          >
            <Label value={GLYPH_WAITING} fontSize={26} color={WHITE} textAlign="middle-center" />
          </UiEntity>
        ) : null}

        {/* Whose hand you are answering — directly above the button, centre.
            Mounted only when there is a name to show. */}
        {action !== null && action.caption !== '' ? (
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { top: '44%', left: '20%' },
              width: '60%',
              height: '7%',
              justifyContent: 'center',
              alignItems: 'center'
            }}
            uiBackground={{ color: PANEL }}
          >
            <Label value={action.caption} fontSize={28} color={WHITE} textAlign="middle-center" />
          </UiEntity>
        ) : null}

        {/* Action button — CENTRE. Mounted only when something is actionable. */}
        {action !== null ? (
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { top: '52%', left: '28%' },
              width: '44%',
              height: '16%',
              justifyContent: 'center',
              alignItems: 'center'
            }}
            uiBackground={{ color: isFirstEver ? ACCENT : action.tint }}
            onMouseDown={action.onTap}
          >
            <Label value={action.glyph} fontSize={64} color={BLACK} textAlign="middle-center" />
          </UiEntity>
        ) : null}
      </UiEntity>
    </ScreenInsetArea>
  )
}

export function setupUi(): void {
  ReactEcsRenderer.setUiRenderer(Hud)
}
