import { engine, Transform, PlayerIdentityData } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { isServer } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'
import { onLeaveScene } from '@dcl/sdk/players'
import { HandshakeLink, PendingHand, WorldStats } from '../components'
import { HANDSHAKE, SERVER } from '../config'
import {
  EMPTY_HAND,
  EMPTY_LINK,
  getHandSlot,
  getLinkSlot,
  getStatsEntity,
  isEmptyHand,
  isEmptyLink,
  isEmptyStats
} from '../entities/slots'
import { hashString } from '../hash'
import { normalizeAddress, pairKey } from '../net/identity'
import { Action, Reason, room } from '../net/protocol'
import { LiveClaims, RateLimiter } from './guards'
import { flushNow, flushStorage, getFailedKeys } from '../net/storage'
import {
  addLink,
  allocateHandSlot,
  consumeAnswered,
  creditAnswered,
  findHandSlotOf,
  getHands,
  getLinks,
  creditConnection,
  expireHands,
  getConnectionCount,
  getDisplayName,
  getTopConnectors,
  getTotalHandshakes,
  hasLinkedPair,
  loadLedger,
  rememberDisplayName,
  forgetDisplayName,
  setHand
} from './ledger'

/**
 * Anti-cheat. The logic lives in ./guards so it can be executed and tested —
 * a mistake in either does not throw, it quietly lets someone forge a handshake
 * or spend the world's whole storage budget.
 */
const rateLimiter = new RateLimiter(SERVER.RATE_MAX_ACTIONS, SERVER.RATE_WINDOW_MS)
const liveClaims = new LiveClaims(SERVER.LIVE_CLAIM_WINDOW_MS)
let ready = false

/**
 * Rejects every write to server-owned state that did not come from the server.
 *
 * Without this, any client could write directly to a link slot and fabricate
 * handshakes — AGENTS.md §5 and §12 #7 both call this out as the classic
 * exploit. The guard is registered for ALL entities of these components rather
 * than per-entity, so a slot added later cannot be forgotten.
 */
function installWriteGuards(): void {
  // Clients legitimately create every slot with EMPTY defaults at boot, because
  // both sides must build the same synced entities. Rejecting those would mean
  // 84 rejected-and-reverted writes per client join for no benefit. Allow the
  // empty default through; reject any client write that carries real content.
  PendingHand.validateBeforeChange(
    (value) => value.senderAddress === AUTH_SERVER_PEER_ID || isEmptyHand(value.newValue)
  )
  HandshakeLink.validateBeforeChange(
    (value) => value.senderAddress === AUTH_SERVER_PEER_ID || isEmptyLink(value.newValue)
  )
  WorldStats.validateBeforeChange(
    (value) => value.senderAddress === AUTH_SERVER_PEER_ID || isEmptyStats(value.newValue)
  )
}

function rateLimited(address: string): boolean {
  return rateLimiter.check(address, Date.now())
}

function reply(address: string, action: string, ok: boolean, reason: string, live = false): void {
  room.send(
    'actionResult',
    { action, ok, reason, live, yourCount: getConnectionCount(address) },
    { to: [address] }
  )
}

/** Server-verified position. Never trust a client-reported one. */
function positionOf(address: string): Vector3.ReadonlyVector3 | undefined {
  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData, Transform)) {
    if (normalizeAddress(identity.address) !== address) continue
    const transform = Transform.getOrNull(entity)
    return transform ? transform.position : undefined
  }
  return undefined
}

/**
 * Whether this address belongs to a guest account.
 *
 * Guests can present a different address each session, so anything persisted
 * against theirs is effectively unreclaimable. Only meaningful while the player
 * is connected; absent players report false, which is why hands capture this at
 * the moment they are extended.
 */
function isGuest(address: string): boolean {
  for (const [, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (normalizeAddress(identity.address) === address) return identity.isGuest
  }
  return false
}

/** Mirrors a ledger hand into its synced slot component. */
function publishHand(slot: number): void {
  const entity = getHandSlot(slot)
  if (entity === undefined) return
  const record = getHands()[slot]
  PendingHand.createOrReplace(entity, record
    ? {
        active: true,
        owner: record.owner,
        ownerName: record.ownerName,
        marked: record.marked,
        seed: record.seed,
        createdAt: record.createdAt
      }
    : EMPTY_HAND)
}

function publishLink(slot: number): void {
  const entity = getLinkSlot(slot)
  if (entity === undefined) return
  const record = getLinks()[slot]
  HandshakeLink.createOrReplace(entity, record
    ? {
        active: true,
        a: record.a,
        b: record.b,
        aName: record.aName,
        bName: record.bName,
        live: record.live,
        seed: record.seed,
        createdAt: record.createdAt
      }
    : EMPTY_LINK)
}

/** Mirrors the authoritative total into its synced slot. */
function publishStats(): void {
  const entity = getStatsEntity()
  if (entity === undefined) return
  const top = getTopConnectors(SERVER.TOP_CONNECTORS_SHOWN)
  WorldStats.createOrReplace(entity, {
    totalHandshakes: getTotalHandshakes(),
    topNames: top.map((c) => c.name),
    topCounts: top.map((c) => c.count)
  })
}

function publishAll(): void {
  publishStats()
  for (let i = 0; i < getHands().length; i++) publishHand(i)
  for (let i = 0; i < getLinks().length; i++) publishLink(i)
}

function completeLink(a: string, b: string, live: boolean): void {
  const lo = a < b ? a : b
  const hi = a < b ? b : a
  const createdAt = Date.now()
  const seed = hashString(`${lo}|${hi}|${createdAt}`) % 100000
  // Capture names NOW. Both participants are present at this moment; whoever
  // walks over to read this link later will find them long gone.
  const slot = addLink(
    { a: lo, b: hi, aName: getDisplayName(lo), bName: getDisplayName(hi), live, seed, createdAt },
    pairKey(lo, hi)
  )
  publishLink(slot)
  // Both participants are credited: a handshake is not something one person does.
  creditConnection(lo, getDisplayName(lo), hi, getDisplayName(hi))
  // The lattice shows at most LINK_SLOT_COUNT links; the total must keep rising.
  publishStats()
}

function handleExtendHand(sender: string, marked: boolean): void {
  if (findHandSlotOf(sender) !== -1) {
    reply(sender, Action.EXTEND, false, Reason.ALREADY_EXTENDED)
    return
  }
  const createdAt = Date.now()
  const slot = allocateHandSlot(createdAt)
  setHand(slot, {
    owner: sender,
    ownerName: getDisplayName(sender),
    ownerIsGuest: isGuest(sender),
    marked,
    seed: hashString(`${sender}|${createdAt}`) % 100000,
    createdAt
  })
  publishHand(slot)
  reply(sender, Action.EXTEND, true, Reason.OK)
}

function handleCompleteHand(sender: string, slot: number): void {
  // Bounds-check before indexing: a malicious client controls this number.
  if (!Number.isInteger(slot) || slot < 0 || slot >= getHands().length) {
    reply(sender, Action.COMPLETE, false, Reason.SLOT_EMPTY)
    return
  }
  const record = getHands()[slot]
  if (!record) {
    reply(sender, Action.COMPLETE, false, Reason.SLOT_EMPTY)
    return
  }
  if (record.owner === sender) {
    reply(sender, Action.COMPLETE, false, Reason.OWN_HAND)
    return
  }
  if (hasLinkedPair(pairKey(sender, record.owner))) {
    reply(sender, Action.COMPLETE, false, Reason.ALREADY_LINKED)
    return
  }

  completeLink(sender, record.owner, false)
  setHand(slot, null)
  publishHand(slot)
  // The absent owner learns they were answered when they next join. Guests are
  // credited in memory but never persisted — their address will not come back.
  creditAnswered(record.owner, !record.ownerIsGuest)
  reply(sender, Action.COMPLETE, true, Reason.OK, false)
}

function handleReportLive(sender: string, rawPartner: string): void {
  const partner = normalizeAddress(rawPartner)
  if (!partner || partner === sender) {
    reply(sender, Action.LIVE, false, Reason.PARTNER_ABSENT)
    return
  }
  if (hasLinkedPair(pairKey(sender, partner))) {
    reply(sender, Action.LIVE, false, Reason.ALREADY_LINKED)
    return
  }

  // Independent re-validation. The clients already agreed between themselves,
  // but that agreement is not evidence — a modified client could claim anything.
  const senderPos = positionOf(sender)
  const partnerPos = positionOf(partner)
  if (!senderPos || !partnerPos) {
    reply(sender, Action.LIVE, false, Reason.PARTNER_ABSENT)
    return
  }
  const limit = HANDSHAKE.RANGE_RELEASE_M * SERVER.RANGE_TOLERANCE
  if (Vector3.distanceSquared(senderPos, partnerPos) > limit * limit) {
    reply(sender, Action.LIVE, false, Reason.TOO_FAR)
    return
  }

  // Require an independent claim from the other side before creating anything.
  const now = Date.now()
  const corroborating = liveClaims.claim(sender, partner, now)

  if (!corroborating) {
    reply(sender, Action.LIVE, false, Reason.PENDING)
    liveClaims.prune(now)
    return
  }

  completeLink(sender, partner, true)
  // Tell the partner too — they are waiting on a PENDING of their own.
  reply(corroborating.from, Action.LIVE, true, Reason.OK, true)
  // If either side had a hand extended, consume it — they have now met in person.
  for (const address of [sender, partner]) {
    const slot = findHandSlotOf(address)
    if (slot !== -1) {
      setHand(slot, null)
      publishHand(slot)
    }
  }
  reply(sender, Action.LIVE, true, Reason.OK, true)
}

function handleJoin(sender: string, displayName: string): void {
  rememberDisplayName(sender, displayName)
  if (!ready) {
    reply(sender, Action.EXTEND, false, Reason.NOT_READY)
    return
  }
  room.send(
    'joinAck',
    {
      totalLinks: getTotalHandshakes(),
      answered: consumeAnswered(sender),
      hasHandOut: findHandSlotOf(sender) !== -1,
      yourCount: getConnectionCount(sender)
    },
    { to: [sender] }
  )
}

/**
 * Server tick. Only drains queued Storage writes — all gameplay is event-driven,
 * so there is no per-tick simulation to run. Kept deliberately trivial because
 * the isolate kills any turn exceeding 10 s of synchronous work.
 */
let accumulated = 0
let sinceFailureReport = 0
let sinceExpirySweep = 0
function serverTick(dt: number): void {
  accumulated += dt
  sinceFailureReport += dt
  sinceExpirySweep += dt

  // Housekeeping for a world that stays up for days at a time. Deliberately
  // infrequent: none of it is gameplay, and it touches every slot.
  if (ready && sinceExpirySweep >= SERVER.EXPIRY_SWEEP_INTERVAL_S) {
    sinceExpirySweep = 0
    // Age out hands left by visitors who are never coming back, so the pool
    // stays available to people who are actually here.
    for (const slot of expireHands(Date.now())) publishHand(slot)
    // Drop rate-limit history for players who left without onLeaveScene firing,
    // which it does not on a crash or a dropped connection.
    rateLimiter.prune(Date.now())
  }

  if (accumulated >= SERVER.FLUSH_INTERVAL_S) {
    accumulated = 0
    flushStorage()
  }

  // The retry layer gives up after a bounded number of attempts. If that is
  // never reported, the scene silently forgets history while appearing healthy —
  // exactly the failure the storage wrapper exists to prevent. Repeated so it
  // cannot be missed in a log tail.
  if (sinceFailureReport >= SERVER.FAILURE_REPORT_INTERVAL_S) {
    sinceFailureReport = 0
    const failed = getFailedKeys()
    if (failed.length > 0) {
      console.error(`[server] PERSISTENCE DEGRADED — these keys are not being saved: ${failed.join(', ')}`)
    }
  }
}

export function startServer(): void {
  if (!isServer()) return

  installWriteGuards()

  room.onMessage('join', (data, context) => {
    if (!context) return
    handleJoin(normalizeAddress(context.from), data.displayName ?? '')
  })

  room.onMessage('extendHand', (data, context) => {
    if (!context) return
    const sender = normalizeAddress(context.from)
    if (!sender || !ready) return
    if (rateLimited(sender)) {
      reply(sender, Action.EXTEND, false, Reason.RATE_LIMITED)
      return
    }
    handleExtendHand(sender, data.marked === true)
  })

  room.onMessage('completeHand', (data, context) => {
    if (!context) return
    const sender = normalizeAddress(context.from)
    if (!sender || !ready) return
    if (rateLimited(sender)) {
      reply(sender, Action.COMPLETE, false, Reason.RATE_LIMITED)
      return
    }
    handleCompleteHand(sender, data.slot)
  })

  room.onMessage('reportLive', (data, context) => {
    if (!context) return
    const sender = normalizeAddress(context.from)
    if (!sender || !ready) return
    if (rateLimited(sender)) {
      reply(sender, Action.LIVE, false, Reason.RATE_LIMITED)
      return
    }
    handleReportLive(sender, data.partner)
  })

  // A departing player is a natural checkpoint — flush rather than risk losing
  // their contribution to a later restart.
  onLeaveScene((userId) => {
    const address = normalizeAddress(userId)
    rateLimiter.forget(address)
    forgetDisplayName(address)
    // A player who leaves mid-exchange must not leave a claim that a returning
    // player could corroborate minutes later.
    liveClaims.forget(address)
    // A departing player is a natural checkpoint. Critically, the server itself
    // shuts down about two minutes after the LAST player leaves, so anything
    // still queued at that point is gone for good.
    flushNow()
  })

  engine.addSystem(serverTick)

  // Boot is async; until it finishes the server refuses gameplay actions rather
  // than acting on an empty ledger and overwriting real history with blanks.
  void loadLedger()
    .then(() => {
      publishAll()
      ready = true
    })
    .catch((error) => {
      console.error('[server] ledger load failed; starting empty', error)
      publishAll()
      ready = true
    })
}

