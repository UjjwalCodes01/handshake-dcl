import { engine, Schemas } from '@dcl/sdk/ecs'

/**
 * A hand left extended by a visitor, waiting for a stranger to complete it.
 *
 * Lives on a fixed slot entity and is written ONLY by the Multiplayer Server.
 * Clients read it to render the ghost and to know what is tappable. Client
 * writes are rejected by validateBeforeChange in server/index.ts — otherwise
 * any player could fabricate handshakes, which AGENTS.md §5 forbids outright.
 */
export const PendingHand = engine.defineComponent('handshake:pending', {
  /** False means the slot is empty. Slots are reused, never destroyed. */
  active: Schemas.Boolean,
  /** Lowercased wallet address of whoever left this hand. */
  owner: Schemas.String,
  /** Display name, for the ghost's nameplate. May be empty for guests. */
  ownerName: Schemas.String,
  /** Earned by solving the echo puzzle. Purely a visual distinction. */
  marked: Schemas.Boolean,
  /** Server-assigned placement seed. Keeps every client's layout identical. */
  seed: Schemas.Int,
  /** Server clock. Safe to compare — one clock, one writer. */
  createdAt: Schemas.Int64
})

/**
 * One completed handshake, rendered as a link in the central lattice.
 * Server-owned and slot-based, same reasoning as PendingHand.
 */
export const HandshakeLink = engine.defineComponent('handshake:link', {
  active: Schemas.Boolean,
  /** The two participants, lowercased and sorted so (a,b) is order-independent. */
  a: Schemas.String,
  b: Schemas.String,
  /**
   * Display names captured when the link was made.
   *
   * Stored rather than looked up: by the time anyone walks over to read this
   * link, both participants are typically long gone, and an absent player has no
   * PlayerIdentityData to resolve a name from. May be empty for guests.
   */
  aName: Schemas.String,
  bName: Schemas.String,
  /** True when the two players shook hands while both physically present. */
  live: Schemas.Boolean,
  seed: Schemas.Int,
  createdAt: Schemas.Int64
})

/**
 * World-wide totals, server-owned.
 *
 * Separate from the link slots because those are a bounded RENDER budget, not a
 * record of everything that ever happened. A world with ten thousand handshakes
 * still shows sixty links — but it should still say ten thousand.
 */
export const WorldStats = engine.defineComponent('handshake:stats', {
  /** Every handshake ever completed here, including those recycled out of view. */
  totalHandshakes: Schemas.Int,
  /**
   * The most-connected visitors, strongest first — parallel arrays rather than a
   * nested map, which keeps the synced payload small and flat.
   *
   * Ranks CONNECTIONS, not points. A scoreboard rewarding domination would fight
   * the premise; one rewarding meeting people rewards what the scene is for.
   */
  topNames: Schemas.Array(Schemas.String),
  topCounts: Schemas.Array(Schemas.Int)
})

/**
 * A player's live offer to shake hands with someone who is present right now.
 *
 * This one is genuinely peer-owned: each client writes only its own, so the tap
 * registers instantly without waiting for a server round-trip. It carries no
 * authority — the server independently validates the resulting claim before any
 * link is created.
 *
 * `seq` is a per-client counter, NOT a wall clock. Client clocks are not
 * comparable, so a remote `seq` is only ever compared against previous values
 * from that SAME client. See systems/handshake.ts.
 */
export const HandshakeIntent = engine.defineComponent('handshake:intent', {
  owner: Schemas.String,
  /** Empty string means "no active offer". */
  target: Schemas.String,
  seq: Schemas.Int64
})
