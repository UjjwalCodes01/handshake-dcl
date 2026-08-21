import { engine, Entity } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { HandshakeIntent } from '../components'
import { HANDSHAKE } from '../config'
import { getSelfAddress, normalizeAddress, pairKey } from '../net/identity'
import { room } from '../net/protocol'
import { getEngagedAddress, isPresent } from './proximity'
import { isLinkedWith } from './lattice'

/** Our own intent entity. Created once, after identity resolves. */
let myIntent: Entity | undefined

/** Per-client counter. Only ever compared against our own previous values. */
let mySeq = 0

/** Local clock reading of when we last issued an offer. */
let myOfferAt = 0
/** Who we last offered to. '' when we have no live offer. */
let myOfferTarget = ''

/**
 * Last observed `seq` per remote player, plus the LOCAL time we first saw it.
 *
 * This is the crux of the no-server design. We never compare a remote client's
 * timestamp to ours — there is no shared clock, and phone clocks routinely
 * differ by seconds, which would make a 3 s window fire at random. Instead we
 * detect "this player issued a NEW offer" by watching their own seq change,
 * then measure that offer's age against OUR clock from the moment we saw it.
 */
type RemoteOffer = {
  seq: number
  target: string
  /**
   * Local clock time we saw this offer become NEW. Zero means "seen, but we
   * never witnessed it being made", which never counts as fresh.
   */
  observedAt: number
}
const remoteOffers = new Map<string, RemoteOffer>()

/** pairKey -> local clock time the pair last completed a handshake. */
const pairCooldowns = new Map<string, number>()

/** Fired when a handshake completes, so UI/audio can react. */
type CompletionListener = (partner: string, isNew: boolean) => void
const listeners: CompletionListener[] = []

export function onHandshakeComplete(cb: CompletionListener): void {
  listeners.push(cb)
}

/** True when a live offer from `address` is currently pointed at us. */
export function hasIncomingOffer(address: string): boolean {
  const self = getSelfAddress()
  if (!self) return false
  const offer = remoteOffers.get(address)
  if (!offer) return false
  if (offer.observedAt === 0) return false // seen, but never witnessed being made
  if (offer.target !== self) return false
  return Date.now() - offer.observedAt <= HANDSHAKE.WINDOW_MS
}

/** True if this pair completed a handshake too recently to do it again. */
export function isPairOnCooldown(self: string, other: string): boolean {
  const last = pairCooldowns.get(pairKey(self, other))
  if (last === undefined) return false
  return Date.now() - last < HANDSHAKE.PAIR_COOLDOWN_MS
}

/**
 * Drops expired cooldown entries.
 *
 * Without this the map keeps one entry per pair for the lifetime of the session.
 * A busy world would accumulate them indefinitely inside a memory budget that is
 * already tight on a low-end phone.
 */
function prunePairCooldowns(now: number): void {
  for (const [key, at] of pairCooldowns) {
    if (now - at >= HANDSHAKE.PAIR_COOLDOWN_MS) pairCooldowns.delete(key)
  }
}

/**
 * Called by the UI when the player taps the handshake button.
 * Safe to call repeatedly — re-tapping simply refreshes the offer window.
 */
export function offerHandshake(): void {
  const self = getSelfAddress()
  const target = getEngagedAddress()
  if (!self || !target) return
  if (target === self) return
  if (!isPresent(target)) return
  if (isPairOnCooldown(self, target)) return
  // The server treats a linked pair as permanent. Offering again would flash
  // success locally and then be silently rejected, producing a tap that appears
  // to work and does nothing.
  if (isLinkedWith(self, target)) return

  ensureIntentEntity()
  if (myIntent === undefined) return

  mySeq += 1
  myOfferAt = Date.now()
  myOfferTarget = target
  HandshakeIntent.createOrReplace(myIntent, { owner: self, target, seq: mySeq })
}

function clearMyOffer(): void {
  const self = getSelfAddress()
  myOfferTarget = ''
  myOfferAt = 0
  if (myIntent === undefined) return
  HandshakeIntent.createOrReplace(myIntent, { owner: self, target: '', seq: mySeq })
}

/**
 * Creates our synced intent entity, once identity is known.
 *
 * Deliberately no entityEnumId: every client creates its own intent entity and
 * they are NOT meant to be the same entity across clients. Assigning a fixed
 * enum id here would make all players collide on one shared slot.
 */
function ensureIntentEntity(): void {
  if (myIntent !== undefined) return
  const self = getSelfAddress()
  if (!self) return

  myIntent = engine.addEntity()
  HandshakeIntent.create(myIntent, { owner: self, target: '', seq: 0 })
  syncEntity(myIntent, [HandshakeIntent.componentId])
}

/**
 * Reports a mutually-confirmed live handshake to the Multiplayer Server.
 *
 * The two clients agreed between themselves so the tap feels instant, but that
 * agreement carries NO authority — a modified client could claim any partner.
 * The server independently re-checks presence and proximity before creating a
 * link, and rejects anything it cannot verify. AGENTS.md §5: never trust the
 * client. The local flash fires immediately regardless; if the server rejects
 * the claim, no link appears and nothing was persisted.
 */
function reportLive(partner: string): void {
  room.send('reportLive', { partner })
}

/**
 * Resolves mutual confirmation. Driven by systems/tick.ts at HANDSHAKE.SCAN_HZ,
 * never per frame.
 */
export function resolveHandshakes(): void {
  const self = getSelfAddress()
  if (!self) return

  ensureIntentEntity()
  const now = Date.now()

  // 1. Refresh our view of every remote offer, using OUR clock for freshness.
  for (const [, intent] of engine.getEntitiesWith(HandshakeIntent)) {
    const owner = normalizeAddress(intent.owner)
    if (!owner || owner === self) continue
    const previous = remoteOffers.get(owner)
    if (previous === undefined) {
      // FIRST sighting. We have no idea how old this offer is — the player may
      // have tapped a minute ago, before we were even in the scene. Recording it
      // as fresh would let a stale, "sticky" offer complete a handshake without
      // that player consenting at this moment, which breaks the entire premise
      // of mutual confirmation. Remember the seq, but never treat it as fresh.
      remoteOffers.set(owner, {
        seq: intent.seq,
        target: normalizeAddress(intent.target),
        observedAt: 0
      })
    } else if (previous.seq !== intent.seq) {
      // We WITNESSED the transition, so we know it was made just now.
      remoteOffers.set(owner, {
        seq: intent.seq,
        target: normalizeAddress(intent.target),
        observedAt: now
      })
    }
  }

  // 2. Drop offers from players who have left, so a departed player's stale
  //    offer can never complete a handshake with nobody.
  for (const [address] of remoteOffers) {
    if (!isPresent(address)) remoteOffers.delete(address)
  }

  // 3. Expire our own offer once its window closes.
  if (myOfferTarget && now - myOfferAt > HANDSHAKE.WINDOW_MS) {
    clearMyOffer()
  }

  // 4. Cancel if our partner walked away mid-offer.
  if (myOfferTarget && !isPresent(myOfferTarget)) {
    clearMyOffer()
  }

  if (!myOfferTarget) return

  // 5. Mutual confirmation: we are offering to them, and we can currently see
  //    a live offer from them pointed back at us.
  const partner = myOfferTarget
  if (!hasIncomingOffer(partner)) return
  if (isPairOnCooldown(self, partner) || isLinkedWith(self, partner)) {
    clearMyOffer()
    return
  }

  // Record the cooldown on BOTH clients so neither side immediately re-offers
  // while the link is still replicating.
  pairCooldowns.set(pairKey(self, partner), now)
  prunePairCooldowns(now)

  // Both sides report. The server de-duplicates by pair, so the second report
  // is rejected harmlessly — that is far safer than electing one reporter and
  // losing the handshake entirely if that client drops mid-exchange.
  reportLive(partner)

  clearMyOffer()

  for (const listener of listeners) listener(partner, true)
}

/** Test seam / teardown. */
export function resetHandshake(): void {
  remoteOffers.clear()
  pairCooldowns.clear()
  myOfferTarget = ''
  myOfferAt = 0
}
