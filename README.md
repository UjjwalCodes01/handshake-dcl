# Handshake

**A social scene for Decentraland, built for mobile.**
Meet a stranger. Confirm each other. Build something neither of you could alone.

World: **`handshakedcl.dcl.eth`** · SDK7 · Friendzone Mobile Buildathon 2026

---

## The problem this is built around

Most social scenes have the same failure: they need two people online at the same moment.
A world with no scheduled event is empty almost all of the time, so a visitor arrives, finds
nobody, and leaves. The mechanic never fires — they don't see a worse version of the
experience, they see nothing at all.

**Handshake works when you're the only person there.**

The world is scattered with *pending hands* — a hand left extended, frozen, by a real
previous visitor. You walk up and complete it. The two marks fuse into a permanent link in
the central lattice, and the person who left it is told they were answered when they next
return. Before you leave, you extend your own hand for whoever comes next.

Every visitor **receives** and **gives**. Every mark belongs to a real person. When someone
else does happen to be present, you can shake hands with them live for a brighter, rarer link.

> Nothing in this world is simulated. There are no fake visitors and no bot hands. If a mark
> is there, a person left it.

---

## What you actually do

No instructions, no tutorial, no text to read. One button, one tap.

| You see | You do |
|---|---|
| 🤝 A glowing spinning marker on the inner ring | Walk to it, tap — you've completed a stranger's handshake |
| 🤝 Another player standing near you | Both tap within a few seconds — a live link, brighter than the rest |
| ✋ Nothing nearby | Tap to leave your own hand for the next visitor |
| ◉ Four pillars on the outer ring | Walk over — they flash a sequence; repeat it to earn a **mark** |
| ◆ A floating mark, on your first visit only | Walk to it. It points at the nearest hand you can answer, and vanishes once you have shaken one |
| The lattice in the centre | Stand near any link to see who made it, and how long ago |

**Everyone has a colour.** It is derived from your address, so it is the same on every
screen and stored nowhere. Each link in the lattice is the two participants' colours
mixed — which means a structure built by fifty strangers looks like fifty strangers
built it, rather than like one pair did it fifty times.

The central pillar brightens *and grows taller* as the lattice fills, so you can tell at a
glance whether this place has a history.

**The world runs on Decentraland's shared clock.** In daylight the ground is legible and the
lattice is one bright object among many. After dark the ground falls away and the lattice
becomes the only light in the scene — which is when a structure built entirely out of other
people's handshakes looks like what it is. Because the clock is coordinated across players,
everyone standing there sees the same sky at the same moment.

---

## Solo play feeds the social record

The **Echoes** puzzle (the four pillars) is single-player, but its reward isn't a score that
disappears when you close the app. Solving it marks the next hand you leave, permanently, in
a lattice that everyone else walks through.

The lattice itself is the other half: it's a browsable record of real meetings, readable on
foot with nobody else online.

---

## Architecture

Scene code in `src/` runs on both the player's device **and** on Decentraland's Multiplayer
Server; `isServer()` splits the two.

```
CLIENT (QuickJS, on the phone)        SERVER (managed by Decentraland)
  proximity scan                        owns the pending-hand ledger
  offer / confirm a handshake   <-->    validates every claim
  lattice + hand rendering              persists via the Storage API
  HUD (react-ecs)                       broadcasts authoritative state
```

**Two sync layers, each the cheapest thing that works.**

1. **Live handshakes** ride peer-owned synced components, so a tap registers instantly with
   no server round-trip.
2. **Pending hands and lattice history** are server-owned and persisted, because they must
   survive an empty world and must not be forgeable.

**Two problems solved without a round-trip:**

- **Clock skew.** Two phones have no shared clock and routinely differ by seconds, so
  comparing timestamps across them would make a 3-second confirmation window fire at random.
  Instead each client watches a peer's own sequence counter to detect *"this is a new offer"*,
  then measures its age against **its own** clock. Remote timestamps are never trusted.
- **Forged consent.** A modified client could write an intent carrying somebody else's
  address. So the server requires **two independent claims** for the same pair inside a window
  before creating anything. A forgery produces one claim and never completes.

Anything a player could gain from is server-validated (`validateBeforeChange` rejects every
client write to server-owned state). The one deliberate exception is the puzzle mark, which is
cosmetic — the reasoning is written down in `src/systems/echoes.ts`.

### Layout

```
src/
  index.ts          entry point — thin, wires systems together
  config.ts         every tunable constant lives here
  sync-ids.ts       synced entity ids, guarded at boot
  components.ts     synced component definitions
  systems/
    tick.ts         the ONLY registered system — one throttled 5 Hz driver
    proximity.ts    nearest-player scan
    handshake.ts    live offer + mutual confirmation
    pendingHands.ts hands left for strangers
    lattice.ts      the growing structure, and reading it
    echoes.ts       the solo memory puzzle
  entities/         ground, anchor, slot pools, pillars
  net/              identity, protocol, session, persistence
  server/           authoritative logic + the persisted ledger
  ui/hud.tsx        react-ecs, mobile-safe
```

### Built for a phone, structurally

- **One registered system.** Everything runs on a single 5 Hz `dt`-accumulating tick.
  Per-frame component writes are the documented top cause of FPS collapse on mobile.
- **No per-tick writes.** Every component write is diffed against last-applied state.
- **115 entities maximum, fully pre-allocated.** Nothing spawns at runtime, so the count
  cannot creep during a long session. Slots that were never used get no mesh at all.
- **No per-frame allocation.** react-ecs re-renders continuously, so all HUD strings are
  memoised and colours hoisted.
- **Reserved zones respected.** Nothing is drawn on the left edge (movement joystick) or the
  bottom-right corner (chat/profile) — those belong to the mobile client.
- **No particles, no dynamic lights, no world-space text.** All three are missing or broken on
  the mobile client; the scene uses emissive materials and 2D UI instead.

---

## Running it

```bash
npm ci                  # exact install from the lock file
npm run typecheck       # tsc --noEmit
npm test                # pure-logic tests, zero dependencies
npm run build
```

The test suite uses Node's built-in runner and native TypeScript stripping, so it
adds **no dependencies** — a test framework has no business anywhere near the
QuickJS sandbox. It covers the logic that fails *silently* rather than loudly:
address normalisation, placement collisions, clock-skew clamping, and
synced-id uniqueness. Each of those produces no error when wrong, only quiet
disagreement between clients.

Preview — **there is no Decentraland desktop client for Linux**, so the default `npm run start`
cannot launch a viewer there:

```bash
npm run start:web       # Bevy web client in a browser
npm run start:mobile    # QR code — preview on a real phone over your LAN
npm run start:multi     # web client, multiple instances (for two-player testing)
```

`start:mobile` needs the Decentraland app installed **and opened once**, with the phone on the
same Wi-Fi.

> ⚠️ The SDK is pinned to an exact `auth-server` prerelease, which is where the Multiplayer
> Server APIs (`isServer`, `Storage`, `registerMessages`) live. Do **not** run
> `npm install @dcl/sdk@latest` — it moves the project off that branch and silently removes
> every trace of persistence. Use `npm run upgrade-sdk`.

### Before publishing

```bash
npm run preflight       # production build + pre-deploy checks
```

This verifies the hard limits that **block a deployment** (file count, total size,
per-file size), confirms every file `scene.json` references exists, and catches the
easiest mistake to make here: shipping the development bundle.

A dev build carries a ~5 MB inline sourcemap and deploys perfectly happily — it just
costs every visitor a multi-megabyte download before anything renders. On a phone
that is the difference between "loading" and "broken".

```
dev build         5669 KB
production build   463 KB   (91% smaller)
```

Deployment is manual through **Creator Hub → Publish → Publish to World**. Publishing the
scene publishes the Multiplayer Server with it; there is no separate hosting.

**See [DEPLOYMENT.md](./DEPLOYMENT.md)** for the full procedure — including the one hard
prerequisite (you must own the NAME you are deploying to) and the three behaviours that
can only be tested in production.

---

## Project status

Honest state, rather than a feature list.

| Area | State |
|---|---|
| Typecheck / build | ✅ Clean |
| Preview + Multiplayer Server boot | ✅ Verified running |
| Real phone, LAN preview | ✅ A wallet connected and authenticated from a device |
| Live two-player handshake | ⬜ Not yet tested with two wallets |
| Persistence across an empty world | ⬜ Not yet verified end to end |
| FPS on a low-end phone | ⬜ Not yet measured |
| Deployed to the World | ⬜ Not yet |

The scene is code-complete through its mobile UX and solo layers. What remains is device
measurement and a deploy — neither of which can be faked by reading the source.

---

## For judges and reviewers

[SUBMISSION.md](./SUBMISSION.md) has the 90-second walkthrough, the eligibility
checklist, and an honest account of what is verified and what is not.
[DEPLOYMENT.md](./DEPLOYMENT.md) covers publishing.

---

## License

MIT — see [LICENSE](./LICENSE).
