import ReactEcs, { Label, ReactEcsRenderer, ScreenInsetArea, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { COLORS } from '../config'
import { getSelfAddress } from '../net/identity'
import { getEngagedAddress } from '../systems/proximity'
import { isPairOnCooldown, offerHandshake } from '../systems/handshake'
import { getLinkReading, getTopConnectors, getTotalHandshakes, isAtAnchor, isLinkedWith } from '../systems/lattice'
import {
  completeReachableHand,
  extendHand,
  getPendingCount,
  getReachableOwnerName,
  getReachableSlot,
  isSlotInFlight
} from '../systems/pendingHands'
import { shortAge } from './relativeTime'
import { resolveTopPanel } from './topPanel.ts'
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
import {
  getAnsweredWhileAway,
  getYourCount,
  isConnected,
  isWaking,
  markHandExtended,
  playerHasHandOut
} from '../net/session'

let flashUntil = 0

export function flashSuccess(durationMs = 1400): void {
  flashUntil = Date.now() + durationMs
}

/**
 * Glyphs live here as real string constants, never inline as JSX attribute
 * strings. JSX does NOT process escape sequences inside attribute quotes, so
 * value="\u{25C6}" renders the literal characters rather than the symbol.
 *
 * EVERY GLYPH MUST BE INSIDE THE BASIC MULTILINGUAL PLANE (<= U+FFFF).
 *
 * This is not a style preference. On a real phone the mobile client rendered
 * NOTHING for astral-plane emoji: the counter showed "0" instead of "handshake
 * 0", and the waiting indicator showed "..." — its U+2026 survived while the
 * U+1F464 beside it vanished. The main action button was blank.
 *
 * Emoji were the entire wordless vocabulary, and on the target platform they did
 * not exist. Geometric shapes (U+25xx), arrows (U+21xx, U+27Fx) and mathematical
 * operators (U+22xx) are text-presentation characters that the client does draw.
 * test/glyphs.test.ts enforces this.
 */
const GLYPH_HANDSHAKE = '\u{25C6}'  // filled diamond: a completed link
const GLYPH_HAND_OUT = '\u{21E7}'  // upward arrow: raise a hand
const GLYPH_WAITING = '\u{25CC}\u{2026}'  // dotted circle: something pending
const GLYPH_WAKING = '\u{27F3}'  // circular arrow: connecting
const GLYPH_FIRST = '\u{25C8}'  // diamond in diamond: nothing here yet
/** Stands in for a participant whose name we never learned (typically a guest). */
const GLYPH_ANON = '\u{2022}\u{2022}\u{2022}'
const GLYPH_ECHO = '\u{25C9}'
const GLYPH_WATCH = '\u{25CE}'  // bullseye: watch this
const GLYPH_WIN = '\u{2713}'  // text-presentation check
const GLYPH_LOSE = '\u{2717}'  // text-presentation cross
const GLYPH_MARK = '\u{2726}'
const GLYPH_ROLL = '\u{2261}'  // three bars: a ranking
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

let rollKey = ''
let rollText = ''
/**
 * The roll of most-connected visitors, as one memoised block.
 *
 * Rebuilt only when the published roll changes. react-ecs re-renders every
 * frame, so composing these strings inline would allocate continuously.
 */
function rollLabel(entries: readonly { name: string; count: number }[], yours: number): string {
  const key = `${entries.map((e) => `${e.name}:${e.count}`).join('|')}#${yours}`
  if (key !== rollKey) {
    rollKey = key
    const rows = entries.map((e, i) => `${i + 1}. ${e.name || GLYPH_ANON}  ${GLYPH_HANDSHAKE} ${e.count}`)
    // Your own standing, always last and always present — the roll should mean
    // something personal even when you are nowhere near the top of it.
    rows.push('')
    rows.push(`${GLYPH_ROLL} ${GLYPH_HANDSHAKE} ${yours}`)
    rollText = rows.join('\n')
  }
  return rollText
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
  const roll = getTopConnectors()

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

  // One panel, one priority chain. Declared last so every input it reads is
  // already resolved — the ordering lives in resolveTopPanel, not here.
  const panel = resolveTopPanel({
    waking,
    puzzleActive,
    showingAnswered,
    atAnchorWithRoll: isAtAnchor() && roll.length > 0,
    reading: reading !== null,
    isFirstEver,
    hasHandOutIdle: action === null && playerHasHandOut()
  })

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
        {panel === 'waking' ? (
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
        {panel === 'puzzle' ? (
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

        {/* The roll of most-connected visitors — TOP CENTRE, at the anchor.
            Ranks CONNECTIONS, not points: a scoreboard rewarding domination
            would fight the premise, one rewarding meeting people rewards
            exactly what the scene is for. */}
        {panel === 'roll' ? (
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { top: '13%', left: '18%' },
              width: '64%',
              height: '28%',
              justifyContent: 'center',
              alignItems: 'center'
            }}
            uiBackground={{ color: PANEL }}
          >
            <Label value={rollLabel(roll, getYourCount())} fontSize={24} color={WHITE} textAlign="middle-center" />
          </UiEntity>
        ) : null}

        {/* Reading a link — who made it, and how long ago. TOP CENTRE.
            This is the solo player's content: the lattice is a record of real
            people, browsable on foot with nobody else online. */}
        {panel === 'reading' && reading !== null ? (
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
        {panel === 'first' ? (
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
        {panel === 'answered' ? (
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
        {panel === 'waiting' ? (
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
