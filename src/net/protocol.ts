import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

/**
 * Every message exchanged between clients and the Multiplayer Server.
 *
 * Defined in one shared module and registered at module load, so both sides
 * always agree on the message set. The docs are explicit that registerMessages()
 * must be called once at top level and never conditionally or inside a function —
 * both sides must register identically or the transport desynchronises.
 *
 * Payloads are kept tiny on purpose. Messages above ~13 KB are dropped SILENTLY
 * by the transport, with no error raised anywhere, so a payload that grows with
 * player count is a latent bug that only appears under load. Nothing here scales
 * with the number of players or the size of the ledger — bulk state travels via
 * synced components instead.
 */
export const Messages = {
  // ---- Client -> Server ----
  /** Sent once per session after state sync. Server replies with joinAck. */
  join: Schemas.Map({ displayName: Schemas.String }),
  /**
   * "Leave my hand extended for a stranger."
   *
   * `marked` says the player solved the echo puzzle this session. It is
   * COSMETIC ONLY and deliberately not server-validated — see systems/echoes.ts
   * for why. A forged mark changes a colour and nothing else; it cannot
   * fabricate a handshake or affect anyone's count.
   */
  extendHand: Schemas.Map({ marked: Schemas.Boolean }),
  /** "Complete the hand in this slot." */
  completeHand: Schemas.Map({ slot: Schemas.Int }),
  /** "I just shook hands live with this player." Server re-validates independently. */
  reportLive: Schemas.Map({ partner: Schemas.String }),

  // ---- Server -> Client ----
  /**
   * Server readiness + this player's personal state. isStateSyncronized() only
   * proves the CLIENT is synced, not that the server finished booting, so the
   * client waits for this before trusting anything.
   */
  joinAck: Schemas.Map({
    totalLinks: Schemas.Int,
    /** How many hands this player left were answered while they were away. */
    answered: Schemas.Int,
    /** Whether this player currently has a hand extended. */
    hasHandOut: Schemas.Boolean
  }),
  /** Outcome of extendHand / completeHand / reportLive. */
  actionResult: Schemas.Map({
    /**
     * Which request this answers. Without it the client cannot tell an
     * extendHand rejection from a completeHand rejection, and has to guess at
     * its own state — which is how optimistic UI drifts out of sync with the
     * server and stays that way.
     */
    action: Schemas.String,
    ok: Schemas.Boolean,
    /** Machine-readable reason. Never shown as text — the UI reacts visually. */
    reason: Schemas.String,
    live: Schemas.Boolean
  })
}

export const room = registerMessages(Messages)

/** Rejection reasons. Kept as constants so client and server cannot drift. */
/** Action names, shared so client and server cannot drift. */
export const Action = {
  EXTEND: 'extend',
  COMPLETE: 'complete',
  LIVE: 'live'
} as const

export const Reason = {
  OK: '',
  NOT_READY: 'not_ready',
  SLOT_EMPTY: 'slot_empty',
  OWN_HAND: 'own_hand',
  ALREADY_LINKED: 'already_linked',
  COOLDOWN: 'cooldown',
  NO_SLOTS: 'no_slots',
  ALREADY_EXTENDED: 'already_extended',
  PARTNER_ABSENT: 'partner_absent',
  TOO_FAR: 'too_far',
  RATE_LIMITED: 'rate_limited',
  /** Claim recorded; waiting for the other player to confirm independently. */
  PENDING: 'pending'
} as const
