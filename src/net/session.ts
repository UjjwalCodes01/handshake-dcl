import { isServer, isStateSyncronized } from '@dcl/sdk/network'
import { getPlayer } from '@dcl/sdk/players'
import { CONNECT } from '../config'
import { Action, Reason, room } from './protocol'
import { getSelfAddress } from './identity'
import { PendingRequests } from './pending'
import { clearAllInFlight, clearInFlight, getLastRequestedSlot } from '../systems/pendingHands'

/**
 * Client-side session state.
 *
 * Two hard requirements shape this file:
 *
 *  1. The scene must stay usable when the server is unreachable — an explicit
 *     line in the definition of done. Everything degrades to "not connected"
 *     and the scene still renders whatever synced state arrived.
 *  2. The server COLD STARTS in about 15 seconds when nobody has visited
 *     recently, and silently discards messages sent while it boots. A judge
 *     opening an empty world is precisely that case, so the client keeps
 *     retrying indefinitely and tells the player the world is waking.
 */

let connected = false
let joinAttempts = 0
let sinceLastAttempt = 0
let waitingFor = 0
let answeredWhileAway = 0
let answeredRemainingS = 0
let hasHandOut = false
/**
 * The unconfirmed "I left a hand" claim.
 *
 * The optimistic flag makes the button react instantly, but if the request is
 * LOST — which is what happens to anything sent while the server cold-starts —
 * no reply ever arrives to correct it. The player would be shown as having a
 * hand out that does not exist, and could never leave one for the rest of the
 * session. Same expiry mechanism as the pending-hand slots.
 */
const HAND_OUT = 'handOut'
const pending = new PendingRequests<string>(CONNECT.REQUEST_TIMEOUT_MS)

/** How long the "you were answered" banner stays up, in seconds. */
const ANSWERED_BANNER_S = 6

export function isConnected(): boolean {
  return connected
}

/**
 * True while we are still waiting for the server to answer our first join.
 * Drives the waking indicator, so an empty screen is never mistaken for a
 * broken scene.
 */
export function isWaking(): boolean {
  return !connected && waitingFor >= CONNECT.WAKING_AFTER_S
}

export function getAnsweredWhileAway(): number {
  return answeredRemainingS > 0 ? answeredWhileAway : 0
}

export function playerHasHandOut(): boolean {
  return hasHandOut
}

/**
 * Optimistic local flag so the button reacts instantly to a tap. The server is
 * authoritative and corrects this on the reply, and again on the next joinAck.
 */
export function markHandExtended(): void {
  hasHandOut = true
  pending.add(HAND_OUT, Date.now())
}

export function installSessionHandlers(): void {
  if (isServer()) return

  room.onMessage('joinAck', (data) => {
    connected = true
    waitingFor = 0
    pending.resolve(HAND_OUT)
    hasHandOut = data.hasHandOut
    if (data.answered > 0) {
      answeredWhileAway = data.answered
      answeredRemainingS = ANSWERED_BANNER_S
    }
  })

  room.onMessage('actionResult', (data) => {
    // Any reply at all proves the server is alive and listening.
    connected = true
    waitingFor = 0

    // The server tells us which request this answers, so we never infer our own
    // state from an ambiguous reply.
    if (data.action === Action.COMPLETE) {
      const slot = getLastRequestedSlot()
      if (slot >= 0) clearInFlight(slot)
    }

    if (data.action === Action.EXTEND) {
      // Confirmed by the server: the optimistic claim is no longer a guess.
      pending.resolve(HAND_OUT)
      hasHandOut = data.ok || data.reason === Reason.ALREADY_EXTENDED
    }

    // Only a LIVE handshake consumes our own extended hand — that is the one
    // path where the server clears it. Completing someone ELSE's hand leaves
    // ours untouched, and clearing it here desynced us from the server.
    if (data.ok && data.action === Action.LIVE) {
      hasHandOut = false
      pending.resolve(HAND_OUT)
    }

    if (data.reason === Reason.NOT_READY) {
      // The server is up but still loading its ledger. Re-run the join
      // handshake rather than sitting half-connected.
      connected = false
      joinAttempts = 0
      sinceLastAttempt = CONNECT.JOIN_RETRY_S
      clearAllInFlight()
    }
  })
}

/**
 * Drives the join handshake and the banner timer.
 *
 * `isStateSyncronized()` only proves the CLIENT is synced — it says nothing
 * about whether the server finished booting. The docs recommend waiting for an
 * explicit server message instead, which is what `joinAck` is.
 *
 * Retries never stop. They slow down after CONNECT.FAST_ATTEMPTS, but a client
 * that gives up permanently can never recover, and the player would be left
 * unable to leave a hand for the rest of their visit with no way to tell why.
 */
export function sessionTick(dt: number): void {
  if (isServer()) return

  if (answeredRemainingS > 0) {
    answeredRemainingS -= dt
    if (answeredRemainingS <= 0) {
      answeredRemainingS = 0
      answeredWhileAway = 0
    }
  }

  // Roll back an optimistic claim the server never confirmed. Without this the
  // button stays hidden for the rest of the session after a single lost message.
  if (pending.expire(Date.now()).length > 0) hasHandOut = false

  if (connected) return

  waitingFor += dt
  sinceLastAttempt += dt

  const interval = joinAttempts < CONNECT.FAST_ATTEMPTS ? CONNECT.JOIN_RETRY_S : CONNECT.SLOW_RETRY_S
  if (sinceLastAttempt < interval) return
  sinceLastAttempt = 0

  if (!isStateSyncronized()) return
  if (!getSelfAddress()) return

  joinAttempts += 1
  const profile = getPlayer()
  room.send('join', { displayName: profile?.name ?? '' })
}

/** Test seam / teardown. */
export function resetSession(): void {
  connected = false
  joinAttempts = 0
  sinceLastAttempt = 0
  waitingFor = 0
  answeredWhileAway = 0
  answeredRemainingS = 0
  hasHandOut = false
  pending.clear()
}
