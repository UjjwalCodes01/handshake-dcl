/**
 * Every tunable constant in the scene lives here.
 * AGENTS.md §10: no magic numbers anywhere else.
 */

/** Scene geometry. One 16x16 parcel — deliberately intimate so strangers actually meet. */
export const SCENE = {
  /** Centre of the parcel. The lattice grows here. */
  CENTRE: { x: 8, y: 0, z: 8 },
  GROUND_SIZE: 16
} as const

export const HANDSHAKE = {
  /**
   * How close two players must be for a handshake to be offered, in metres.
   * Generous on purpose: precise positioning is painful on a touch joystick.
   */
  RANGE_M: 4.0,

  /**
   * Hysteresis. Once in range, a player stays "engaged" until this larger
   * distance, so the button does not flicker when someone hovers at the edge.
   */
  RANGE_RELEASE_M: 5.0,

  /**
   * How long an intent stays live after tapping, in milliseconds.
   * Must absorb mobile network latency on both sides. Tune on real devices.
   */
  WINDOW_MS: 3000,

  /** Refuse to re-link the same pair again until this elapses. */
  PAIR_COOLDOWN_MS: 20000,

  /** Proximity scan rate. AGENTS.md §7: never poll per frame. */
  SCAN_HZ: 5
} as const

export const HANDS = {
  /**
   * How long an unanswered hand stays out, in milliseconds (14 days).
   *
   * Without expiry the 24 slots fill permanently and every new visitor's hand
   * silently evicts someone else's. With it, dead hands from long-gone visitors
   * age out first and the world keeps room for whoever is here now.
   */
  TTL_MS: 14 * 24 * 60 * 60 * 1000,

  /** Ring the pending hands stand on, inside the lattice ring. */
  RADIUS_M: 5.4,
  /** How close a player must be to complete a pending hand, in metres. */
  REACH_M: 3.0,
  /** Hysteresis, matching the live-handshake behaviour. */
  REACH_RELEASE_M: 4.0,
  HEIGHT_M: 1.1,
  /** Marker size. Large enough to read on a 5-inch screen from across the parcel. */
  SIZE: 0.42,
  /**
   * Extra size applied to the hand you are close enough to answer. Motion and
   * scale are the two cues that survive a 5-inch screen in sunlight; colour
   * alone does not.
   */
  REACH_SCALE: 1.5,
  /**
   * Idle spin, degrees per second. Slow enough not to be busy, fast enough that
   * peripheral vision catches it — the whole job of this animation is to say
   * "this object is interactive" without a word of text.
   */
  SPIN_DEG_PER_S: 35
} as const

export const ECHOES = {
  /**
   * The solo puzzle: four pillars flash a sequence, the player walks to each in
   * turn and answers it.
   *
   * Chosen because it needs no words. A judge with no shared language and no
   * instructions understands "repeat what it just showed you" immediately, which
   * is the §6 bar. It is also the core mechanic in miniature — something reaches
   * out, you answer in kind.
   */
  PILLAR_COUNT: 4,
  /** Ring the pillars stand on, outside the hands so the two never overlap. */
  RADIUS_M: 6.9,
  HEIGHT_M: 1.6,
  WIDTH_M: 0.5,

  /** How close you must stand to answer a pillar. */
  REACH_M: 2.6,

  /**
   * How long after arriving before the puzzle may auto-start, in seconds.
   *
   * A spawn point once sat 1.9 m from a pillar, so players were dropped straight
   * into a memory game before they had looked around — a judge would have met
   * the puzzle before the handshake, inverting what this scene is about. The
   * spawn has moved, but this makes the ordering impossible to break by accident
   * the next time the geometry is tuned.
   */
  GRACE_S: 4,

  /** Sequence length per round. Three rounds, then the mark is earned. */
  ROUND_LENGTHS: [3, 4, 5],

  /** Playback timing, in seconds. Slow enough to follow on a phone. */
  FLASH_ON_S: 0.55,
  FLASH_GAP_S: 0.25,
  /** Pause before playback starts, so the player can look up. */
  LEAD_IN_S: 0.8,
  /** How long the win/lose flash holds before the puzzle resets. */
  RESOLVE_S: 1.6,

  /** Colours are per-pillar and fixed, so the sequence is readable by position AND hue. */
  TINTS: [
    { r: 1.0, g: 0.45, b: 0.45 },
    { r: 0.45, g: 1.0, b: 0.6 },
    { r: 0.5, g: 0.6, b: 1.0 },
    { r: 1.0, g: 0.85, b: 0.4 }
  ]
} as const

export const GUIDE = {
  /**
   * A wordless marker over the nearest thing a new player can act on.
   *
   * The scene has no text and no tutorial, which is the right call — but a
   * first-timer still has to work out that walking somewhere is the move. This
   * is the whole of the onboarding: a floating mark, universally understood from
   * every game that has ever used one, and no language to translate.
   *
   * It disappears the moment the player completes their first handshake. After
   * that they know, and a permanent marker would just be clutter.
   */
  SIZE: 0.3,
  /** How far above the target it floats. */
  HEIGHT_OFFSET_M: 1.4,
  /** Bob amplitude and period, to catch the eye without being frantic. */
  BOB_M: 0.18,
  BOB_PERIOD_S: 2.2,
  TINT: { r: 1.0, g: 0.95, b: 0.7 }
} as const

export const EMOTE = {
  /**
   * Played when a handshake completes.
   *
   * A wave, not a cheer: this is two strangers acknowledging each other, and the
   * gesture should read as greeting rather than victory. Valid predefined emote
   * names are fixed by the client — 'wave' is among them.
   */
  ON_HANDSHAKE: 'wave',

  /**
   * Minimum gap between triggered emotes, in milliseconds.
   *
   * Without it, completing several handshakes in quick succession would restart
   * the animation repeatedly and the avatar would twitch instead of wave.
   */
  COOLDOWN_MS: 4000
} as const

export const LATTICE = {
  /**
   * Hard cap on simultaneously rendered link entities.
   * The oldest link is recycled once this is reached, so the entity count is
   * bounded by construction rather than by discipline. Protects the 30 FPS gate.
   */
  MAX_LINKS: 60,

  /** Radius of the ring the links arrange themselves around. */
  RADIUS_M: 3.2,
  /**
   * How the anchor grows with accumulated history.
   *
   * Logarithmic on purpose. Linear growth would either be invisible at ten
   * handshakes or breach the scene height limit at ten thousand; a log curve
   * stays legible across both. The cap keeps it comfortably under the
   * single-parcel ceiling of log2(n+1)x20 = 20 m.
   */
  GROWTH_PER_DECADE_M: 2.4,
  MAX_ANCHOR_HEIGHT_M: 14,

  /** Vertical span the lattice climbs as it fills. */
  HEIGHT_M: 4.0,
  LINK_THICKNESS: 0.12,

  /**
   * How close you must stand to a link to read who made it, in metres.
   *
   * Deliberately smaller than the hand reach: the lattice is dense, and a
   * generous radius would flicker between neighbouring links as you walk.
   */
  /**
   * How close to the anchor you must stand to read the roll of most-connected
   * visitors. Inside the lattice ring, so it is something you walk INTO — the
   * structure representing accumulated history is where you see who built it.
   */
  ROLL_RANGE_M: 2.6,

  READ_RANGE_M: 2.6,
  READ_RELEASE_M: 3.4,
  /**
   * Height offset applied to the player when testing distance to a link.
   *
   * A player's Transform sits at their FEET, but the lattice spans 0.4 m to
   * 4.4 m. Measuring from the feet makes anything above roughly head height
   * unreadable no matter how close you stand. Measuring from mid-torso centres
   * the readable band on the structure instead.
   */
  READ_EYE_OFFSET_M: 1.3
} as const

export const COLORS = {
  /** Emissive, opaque. AGENTS.md §7: blended transparency bypasses render optimisation. */
  LINK: { r: 0.45, g: 0.85, b: 1.0 },
  LINK_FRESH: { r: 1.0, g: 0.92, b: 0.55 },
  /** Hands left by a player who solved the echoes. */
  MARKED: { r: 0.85, g: 0.55, b: 1.0 },
  ANCHOR: { r: 0.18, g: 0.22, b: 0.32 },
  GROUND: { r: 0.09, g: 0.10, b: 0.14 }
} as const

export const SERVER = {
  /**
   * Rate limit per player. Well below the transport's ~300 msg/sec peer cap —
   * that limit protects the transport, this one protects gameplay and, more
   * importantly, bounds how many Storage writes one player can trigger.
   */
  RATE_MAX_ACTIONS: 8,
  RATE_WINDOW_MS: 10000,

  /**
   * Slack applied to the client's range when the server re-validates a live
   * handshake. Positions on the server are sampled independently and players
   * keep moving, so a strict equality check would reject legitimate handshakes.
   */
  RANGE_TOLERANCE: 1.6,

  /**
   * How long the server holds a one-sided live-handshake claim while waiting for
   * the other party to confirm independently, in milliseconds. Must comfortably
   * exceed mobile round-trip latency for both peers.
   */
  LIVE_CLAIM_WINDOW_MS: 6000,

  /**
   * Hard cap on remembered "answered while away" entries.
   *
   * This map is persisted and keyed by wallet address. Guest accounts can
   * present a different address each session, so without a cap it would grow
   * forever with entries no one will ever collect, inside a 256 MB isolate.
   */
  MAX_ANSWERED_ENTRIES: 400,

  /**
   * Display names kept in memory. Bounded by evicting the least recently seen,
   * never by refusing new ones — see server/names.ts.
   */
  MAX_DISPLAY_NAMES: 500,
  /** Attacker-supplied text synced to every client; truncated before storage. */
  MAX_NAME_LENGTH: 24,

  /** How many visitors the most-connected table tracks before pruning. */
  MAX_CONNECTORS: 200,
  /** How many appear on the roll at the anchor. */
  TOP_CONNECTORS_SHOWN: 5,

  /** How often expired hands are swept, in seconds. Housekeeping, not gameplay. */
  EXPIRY_SWEEP_INTERVAL_S: 120,

  /** How often the server drains queued Storage writes, in seconds. */
  FLUSH_INTERVAL_S: 2,

  /**
   * How often the server reports permanently-failed Storage keys, in seconds.
   * Without this the retry layer gives up in silence, which is the exact failure
   * mode the whole wrapper exists to prevent.
   */
  FAILURE_REPORT_INTERVAL_S: 30
} as const

export const CONNECT = {
  /**
   * The Multiplayer Server shuts down about two minutes after the last player
   * leaves, and a cold start takes roughly 15 SECONDS in production. Messages
   * sent before it finishes booting are silently lost.
   *
   * This is the single most likely thing a judge experiences: they open an empty
   * world, so they ARE the cold start. The scene must show it is waking rather
   * than looking broken, and must keep retrying rather than giving up.
   *
   * Local preview starts the server instantly, so none of this reproduces
   * without publishing.
   */
  JOIN_RETRY_S: 1.5,
  /** After this many fast attempts, fall back to the slow cadence. */
  FAST_ATTEMPTS: 20,
  /** Never stop retrying — a stuck client can never recover otherwise. */
  SLOW_RETRY_S: 15,
  /** Show the "waking up" indicator once we have waited this long, in seconds. */
  WAKING_AFTER_S: 2.5,

  /**
   * How long to wait for a reply before assuming the request was lost, in ms.
   *
   * The server silently DISCARDS messages sent while it cold-starts, and that
   * boot takes about 15 seconds. Without a timeout, a player who taps during
   * that window waits forever: the optimistic lock never clears, so the button
   * for that hand never returns and they cannot retry for the rest of the
   * session. A judge arriving at a sleeping world is exactly that player.
   *
   * Generous enough not to fire on ordinary mobile latency.
   */
  REQUEST_TIMEOUT_MS: 8000
} as const
