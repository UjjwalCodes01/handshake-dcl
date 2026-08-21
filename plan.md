# plan.md — Handshake

**How this scene gets built.** Companion to [`AGENTS.md`](./AGENTS.md) (technical rules)
and [`CLAUDE.md`](./CLAUDE.md) (workflow). If this conflicts with `AGENTS.md`, `AGENTS.md` wins.

> **Revision 2 — Aug 20, 2026.** Rewritten after scaffolding the project and verifying every
> Decentraland API against `node_modules/@dcl/sdk`. Three assumptions in revision 1 were wrong;
> they are corrected in §3 and marked ⚠️. The core mechanic also changed — see §1.

---

## 0. The number that governs everything

**Today is Aug 20, 2026. Submission closes Sep 4. That is 15 calendar days.**

The buildathon was advertised as three weeks; a third was gone before the first commit.
Every decision here is made against 15 days. **We submit Sep 3.** The last day is regressions only.

---

## 1. What we are building

**Handshake — across time.**

The world is scattered with *pending handshakes*: a hand extended and frozen, each one left by a
real previous visitor. You walk up, tap once, and complete it — the two marks fuse into a
permanent link in the central lattice, and the person who left it sees they were answered when
they return. Before you leave, you extend your own hand for whoever comes next.

Every visitor **receives** and **gives**. When another player happens to be present live, you can
shake with them directly for a brighter, rarer link.

### Why this and not the live-only version

Revision 1 specified a purely live mechanic: two players near each other, both tap, link forms.
Its own risk register listed *"nobody else online when judges visit"* at likelihood **Certain** —
and then treated it as an edge case with a fallback. That was backwards.

Judges open the scene **alone**, on a phone, at an arbitrary hour, for about 90 seconds. A World
with no scheduled event is empty nearly all the time. A mechanic requiring two simultaneous
players doesn't merely score poorly on Social Value — it never fires at all, so the judge sees
nothing. The async model makes solo arrival the *designed* path while keeping every interaction
genuinely between two real people.

| | Live-only (rev 1) | Across time (rev 2) |
|---|---|---|
| Judge alone at 3am | Mechanic never fires | Full experience immediately |
| Social Value | Requires luck | Every interaction is with a real person |
| Retention | Watch a counter grow | **Return to see who answered you** |
| Eligibility | Safe | Safe — live layer retained deliberately |

> ⚠️ **Eligibility note.** The rules require "meaningful social interaction" and forbid pure
> single-player. Async interaction with other players' real actions clearly qualifies, but it is
> ultimately the organisers' judgment call. The **live** handshake layer is kept specifically so
> eligibility is never in question — it is not decoration.

### Comprehensible without reading

No instructional text anywhere. A pending hand glows and beckons. The 🤝 button appears only when
something is actionable. Success is a light burst and a new link flying into the lattice. Target:
understood in **under 15 seconds**, in any language.

---

## 2. Status

| Phase | State |
|---|---|
| 0. Scaffold + toolchain | ✅ Done — SDK 7.26.0, `tsc --noEmit` clean, `npm run build` clean |
| 0b. Deploy pipeline proven on a real phone | ⬜ **Blocked on you** — de-risked as far as possible: `npm run preflight` passes |
| 1. Live handshake vertical slice | ✅ Code complete, **untested on device** |
| 2. Async persistence + pending hands | ✅ Code complete, **boots clean**, untested with a client |
| 3. Mobile UX pass | ✅ Code complete; **verified running on a real phone** |
| 3b. Solo layer — explorable lattice | ✅ Code complete, **untested on device** |
| 3c. Solo layer — Echoes puzzle | ✅ Code complete, **untested on device** |
| 4. Performance pass | ◐ Static half done; **device measurement is yours** |
| 5. Freeze | ⬜ |
| 6. Polish + docs | ◐ README, LICENSE, CI, reproducible install ✅ · thumbnail ⬜ |
| 7–8. Submit + buffer | ⬜ |

**Aug 20 — first real device connection.** A wallet authenticated and connected from a
phone over LAN preview (`npm run start:mobile`). The mobile testing loop no longer
requires a deploy.

Shipped in Phase 3c — **Echoes**, a wordless memory puzzle for solo players. Four pillars
flash a sequence; the player walks to each in turn and answers it. Three rounds earn a
**mark**, and the next hand they leave carries it permanently into the shared lattice — so
solo play feeds the social record rather than sitting beside it.

Design notes worth keeping:
- **No text in any state.** Watch-vs-answer is an icon, progress is pips. A judge with no
  shared language understands "repeat what it just showed you" instantly.
- **Approaching a pillar starts it.** No prompt to find, no button to discover.
- **The reward is cosmetic and NOT server-validated**, on purpose. A forged mark changes a
  colour and nothing else — it cannot fabricate a handshake or move any count. Validating it
  would mean replaying the puzzle server-side to guard a hue, which is not a trade worth
  making. Everything that matters stays server-authoritative.
- **No `Math.random`.** Sequences are derived by hashing the player's address with the round
  and attempt. A sandbox that stubs or freezes `Math.random` would otherwise serve one
  sequence forever — a bug no typecheck would catch.

Shipped in Phase 3b — **the solo layer**. The async design assumed a lone visitor answers
hands left by previous visitors, but on a *fresh* world there are none: the first person
would find an empty ring and nothing to do. Now:

- **The lattice is browsable.** Stand near any link and the HUD names the two real people
  who made it and how long ago. The structure becomes a record instead of decoration, and
  it works with nobody else online.
- **The anchor is a beacon**, brightening in discrete steps as the lattice fills — the
  immediate signal that this place has a history.
- **Being first is an event**, not an empty room.

> Deliberately NOT done: seeding the world with invented visitors. That every mark belongs
> to a real person is the premise worth defending; faking it would make the scene a lie,
> and it is the kind of thing judges notice.

Shipped in Phase 3: idle-spin on pending hands (engine-side Tween, zero per-frame cost),
reach highlight by scale + emissive, owner name surfaced in the 2D HUD, single-action
button rule enforced in [`ui/hud.tsx`](./src/ui/hud.tsx).

Shipped in Phase 1: [`src/systems/proximity.ts`](./src/systems/proximity.ts),
[`handshake.ts`](./src/systems/handshake.ts), [`lattice.ts`](./src/systems/lattice.ts),
[`tick.ts`](./src/systems/tick.ts), [`ui/hud.tsx`](./src/ui/hud.tsx),
[`net/identity.ts`](./src/net/identity.ts).

---

## 3. Corrections to revision 1

All verified against `node_modules/@dcl/sdk` and the current docs, not assumed.

| # | Revision 1 said | Reality |
|---|---|---|
| ⚠️ 1 | Use `MessageBus` for handshake intent | **`MessageBus` is `@deprecated`** — *"will only exist for a few releases in ECS7"*. Intent now rides on a **synced component** instead. No deprecated API anywhere in the scene. |
| ⚠️ 2 | A fixed 60-slot pool is needed so every `entityEnumId` stays unique and < 8001 | `entityEnumId` is **only** required for entities created identically on all clients at scene start. Dynamically spawned links must **not** have one — the runtime assigns unique ids, and hardcoding one would make two clients collide. The pool survives only as a **render cap**. |
| ⚠️ 3 | Persistence is a ~2-day stretch goal | **Decentraland hosts and deploys the Multiplayer Server for free**, published by the normal deploy flow. Persistence is far cheaper than estimated and is now **core**, not stretch. |
| ✅ 4 | Reserved-zone rules hand-drawn in AGENTS.md §6 | Confirmed, plus `ScreenInsetArea` exists in react-ecs for device notch/home-indicator insets. Now used. It does **not** cover the joystick/chat zones — those still need manual avoidance. |

**Verified API surface** (was §9 "assumptions"):

`engine.getEntitiesWith(PlayerIdentityData, Transform)` for player positions ·
`PBPlayerIdentityData { address, isGuest }` · `syncEntity(entity, componentIds[], enumId?)` ·
`parentEntity()` · `getPlayer()` → `{ userId, position, … }` · `onEnterScene`/`onLeaveScene`
from `@dcl/sdk/players` · `getRealm()` from `~system/Runtime` · `AvatarAttach` +
`AvatarAnchorPointType` · `Vector3.distanceSquared` · `engine.PlayerEntity`.

---

## 4. Architecture

### Client ↔ server split

```
CLIENT (QuickJS, on the phone)          SERVER (managed, hosted by Decentraland)
  proximity scan                          owns pending-hand ledger
  offer / confirm handshake       <-->    validates every claim
  lattice rendering (local only)          persists via Storage API
  HUD (react-ecs)                         broadcasts authoritative state
```

Scene code in `src/` runs on **both**. `isServer()` branches execution. Enabled by
`"authoritativeMultiplayer": true` in `scene.json` and the `@dcl/sdk@auth-server` branch.

### Two sync layers, each the cheapest thing that works

1. **Live handshake** → synced components (`syncEntity`). No server round-trip, so the tap feels
   instant. Resolution is peer-local; see below.
2. **Pending hands + lattice history** → **server-owned**, persisted with `Storage`. Must survive
   an empty world, and must not be forgeable.

### Two problems solved without a server round-trip

**Clock skew.** Two phones have no shared clock and routinely differ by seconds, so comparing
timestamps across clients would make a 3-second window fire at random. Instead each client watches
a peer's own `seq` counter to detect *"this is a new offer"*, then measures that offer's age
against **its own** clock from the moment it observed it. Remote timestamps are never trusted.

**Duplicate spawn.** Both clients detect mutual confirmation simultaneously. `self < partner` is
antisymmetric, so both independently agree on who creates the shared entity. Exactly one acts.
No negotiation, no duplicate.

### Anti-cheat

Anything a player could gain from is server-validated with `validateBeforeChange`. The client is
never trusted for handshake counts. `AGENTS.md` §5: *never trust the client.*

### Repo layout

```
src/
  index.ts          main() — thin, wires systems
  config.ts         every tunable constant. No magic numbers elsewhere.
  sync-ids.ts       the single enum, all < 8001, guarded at boot
  components.ts     synced component definitions
  systems/
    tick.ts         THE only registered system — one throttled 5 Hz driver
    proximity.ts    nearest-player scan
    handshake.ts    offer + mutual-confirm resolution
    lattice.ts      deterministic link placement, render cap
  entities/world.ts ground, anchor, beacons
  ui/hud.tsx        react-ecs, mobile-safe
  net/
    identity.ts     address normalisation + tiebreak
    storage.ts      server-side persistence (Phase 2)
  server/           isServer() branch logic (Phase 2)
```

**One registered system, not many.** Everything runs on a single 5 Hz `dt`-accumulating tick.
Per-frame component reads are the documented top cause of mobile FPS collapse, and ordering
becomes explicit rather than dependent on registration order.

---

## 5. Server limits to design against

Hard caps. Exceeding them silently drops data or kills the server **for everyone in the scene**.

| Limit | Value | Consequence |
|---|---|---|
| Memory | 256 MB isolate | Exceeded → isolate disposed, server dies for all players |
| Sync CPU | 10 s per turn | Unbounded loop kills the isolate |
| Async settle | 60 s | Slow promise chain terminates the isolate |
| Inbound rate | ~300 msg/peer/sec | Excess frames **dropped, not queued** |
| Packet size | 128 KB in; keep synced msgs < 13 KB | Oversized packets dropped entirely |
| **In-flight host calls** | **40, isolate-wide** | Excess **rejects immediately**, not queued |

> ⚠️ **The silent-data-loss trap.** `Storage.set()` **never throws**. On failure it logs and
> resolves to `false`. A discarded boolean is a lost save that looks like success. **Every write
> in this scene must check its result and retry.** This is the single easiest way to ship a scene
> that quietly forgets everything.

Storage is durable persistence, **not** a live datastore. Working state lives in server memory;
writes happen at debounced checkpoints (player leaves, ~30 s timer), never per change.

---

## 5b. Mobile platform gaps that constrain design

From the [godot-explorer parity tracker](https://docs.decentraland.org/creator/build-for-mobile/mobile-client/missing-features).
These are not preferences — they are things that **do not work on the target platform**.

| Feature | Status on mobile | Consequence here |
|---|---|---|
| **Particle system** | Missing | No particle feedback. Scale + emissive only. |
| **Scene dynamic lights** | `PBPointLight` exists, not implemented | All glow must be **emissive material**, never a light. Already the case. |
| **`TextShape` height parity** | Renders at different heights vs desktop | **No world-space nameplates.** Identity is shown in the 2D HUD instead. |
| **Audio Event component** | No ETA | ⚠️ Puts stretch goal §9 #2 (ambient audio) at risk. Verify `AudioSource` separately before committing to it. |
| **Proximity voice chat** | Not in mobile | `voiceChat: enabled` in `scene.json` is a desktop-only nicety. Never design around it. |
| **`UiBackground` nine-slice** | Tiles instead of stretching | Only affects textured backgrounds. Ours are solid colours — safe. |
| **Gestures / hover / keyboard** | Not supported, not planned | Single tap is the whole vocabulary. Already enforced. |

> The `TextShape` one is the trap: it renders fine in desktop preview and wrong on a
> phone, so it would have passed every test available on this machine and failed on
> the only platform that counts.

---

## 5b2. Deploy readiness

`npm run preflight` runs a production build and checks everything checkable before you
click Publish. Current state: **5 files, 0.56 MB, all hard limits passed.**

| Limit | Kind | Ours |
|---|---|---|
| File count | **HARD — blocks deploy** | 5 / 200 |
| Total upload size | **HARD — blocks deploy** | 0.56 MB / 15 MB |
| Per-file size | **HARD — blocks deploy** | 0.45 MB / 50 MB |
| Rendered entities | soft (warning) | ≤ 115 / 200 |
| Materials | soft (warning) | approaches `log2(2)×20 = 20` in a *full* world |
| Height | soft (warning) | ~4.8 m / 20 m |

Only entities **actually being rendered** count toward the soft limits, and slots that were
never used get no mesh at all — so an empty world sits far below them and a heavily-used one
approaches them. Materials are the one to watch: a world with all 60 links and 24 hands
active would carry roughly 90 materials against a soft cap of 20. That is a warning and a
frame-rate cost, not a deploy failure, and `LINK_SLOT_COUNT` / `HAND_SLOT_COUNT` in
`config.ts` are the dials if measurement says it matters.

> **The 91% mistake.** `sdk-commands deploy` has no `--production` flag and rebuilds by
> default, so it is easy to ship the dev bundle: 5669 KB against 463 KB, almost all of it an
> inline sourcemap every visitor downloads before seeing anything. Preflight fails the run
> if the bundle looks like a dev build.

---

## 5c. Phase 4 — performance

### Done statically (Claude)

| Property | State |
|---|---|
| Per-tick component writes | **None.** Every write is diffed against last-applied state. |
| Entity count | **115 maximum, fully pre-allocated.** Nothing spawns at runtime, so it cannot creep during a long session. |
| Meshes for unused slots | **Never created.** A slot that was never active has no mesh, material or transform at all. |
| Per-frame allocation in the HUD | **Eliminated.** react-ecs re-renders continuously, so every template literal and inline `Color4` was allocating ~60×/sec. All label strings are memoised, colours hoisted, and the action object reused. |
| Per-tick allocation in systems | **Eliminated.** The proximity scan previously allocated an object + `Vector3` per player per tick — cost that grows with crowd size, exactly when the budget is tightest. Records are now reused in place. |
| Animation cost | Idle spin is an engine-side `Tween`; scene code does no per-frame work for it. |
| Transparency | None. All materials opaque + emissive (§7, and mobile has no dynamic lights anyway). |
| Textures / models | None. Primitives only — no atlas problem, no `.glb` loading cost. |

### Only you can do this part

Claude cannot measure a frame rate. The gate is **30+ FPS on the low-end phone**.

1. `npm run start:mobile`, scan the QR.
2. In preview press **`Y`** for the debug panel; on a deployed scene type **`/showfps`** in chat.
3. Walk the full loop: spawn → outer pillar ring (solve the echoes) → hand ring → into the lattice.
4. Record FPS at each, and watch **"Pending on Queue"**.

**What the numbers mean**

| Observation | Meaning | Action |
|---|---|---|
| FPS ≥ 30 everywhere | Gate passed | Move to Phase 5 freeze |
| FPS dips only inside the lattice | Draw calls from ~60 individual materials | Lower `LINK_SLOT_COUNT`, or share one material per state |
| FPS dips near the hand ring | The 24 spin Tweens | Lower `HAND_SLOT_COUNT`, or spin only hands within reach |
| **"Pending on Queue" grows** | Scene→engine message backlog — the §7 red flag | **Stop adding features.** Report the number and where it happened. |
| Stutter rather than low FPS | GC pauses | Report it; means an allocation source is left that this audit missed |

Every tuning knob above lives in `src/config.ts`, so the fixes are one-line constant changes, not refactors.

---

## 6. Schedule — 15 days, gated

| Days | Phase | Gate |
|---|---|---|
| Aug 20–21 | **0. Pipeline** | ✅ Scaffold builds. ⬜ **Throwaway build live on a real phone — nothing is validated until this passes** |
| Aug 22–24 | **1. Live slice** | ✅ Code complete. ⬜ Two windows, two wallets, link spawns exactly once |
| Aug 25–27 | **2. Async layer** | Pending hands persist across a fully empty world |
| Aug 28–29 | **3. Mobile UX** | First-timer understands it in < 15 s; no UI in reserved zones |
| Aug 30–31 | **4. Performance** | **30+ FPS on the low-end phone.** Hard gate |
| Sep 1 | **5. Freeze** | Scope locked. No new features |
| Sep 2 | **6. Polish + docs** | `README.md` accurate, repo clean, no secrets |
| Sep 3 | **7. SUBMIT** | Submitted to DoraHacks |
| Sep 4 | **8. Buffer** | Regressions only |

**If Phase 0b slips past Aug 22, the stretch list in §9 is cancelled outright.**

---

## 7. Definition of done

From `AGENTS.md` §11. Not done until:

- [ ] `npx tsc --noEmit` clean
- [ ] Two explorer windows, **different wallet addresses**
- [ ] Tested on a **real phone** in the Decentraland mobile app
- [ ] No UI in reserved left-edge / bottom-right zones
- [ ] **30+ FPS** on the test phone
- [ ] Comprehensible to a first-timer with zero explanation
- [ ] Degrades sanely alone, **and when the server is unreachable**
- [ ] Every `Storage` write checks its boolean result

---

## 8. Who tests what

| Check | Owner |
|---|---|
| Typecheck, build, code review vs `AGENTS.md` | Claude |
| Logic review — sync ids, clock handling, per-frame writes | Claude |
| Preview boots, server starts, scene logs clean | Claude (verified by running it) |
| Preview; two windows on different wallets | You |
| **Real phone, mobile app** | **You — always** |
| FPS on a low-end device | You |

Claude cannot validate the bottom three. "Done" from Claude means *typechecked,
logic-reviewed, and booted*, and will say which.

### Previewing on Linux

There is **no Decentraland desktop client for Linux**, and the default `npm run start`
deep-link resolves to `xdg-open decentraland://…` with no registered handler — so it
exits 4 and never launches a viewer. Use these instead:

| Command | What it does |
|---|---|
| `npm run start:web` | Bevy Web client in a browser. The normal Linux path. Chromium will ask for **Local Network Access** — click Allow, or it cannot reach localhost. |
| `npm run start:mobile` | Prints a QR code pointing at your LAN address. **Preview on a real phone, with hot reload, without deploying.** |
| `npm run start:multi` | Web client with `--multi-instance`, for the two-window test. |

`start:mobile` is the important one: real-device testing no longer requires a
publish cycle, so the mobile checks in the table above can happen every day rather
than only after a deploy.

> ⚠️ Never run `npm install @dcl/sdk@latest`. It moves the project off the
> `auth-server` branch, silently removing `isServer`, `Storage` and
> `registerMessages` — and every trace of persistence with them. `npm run
> upgrade-sdk` is pinned to the correct branch.

---

## 9. Stretch — only if the Sep 1 gate passes

1. **Handshake variety** — repeat handshakes with the same person produce brighter links.
2. **Ambient audio** — a tone per handshake, pitch rising with chain length.
3. **Return notification** — you are told how many hands you left were answered while away.
4. **Spawn tuning** — spawn facing the lattice, so the structure is the first thing seen.

Adding to this list requires cutting from it.

---

## 10. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| **SDK6 code gets written** | High — documented #1 failure mode | Verify against `node_modules/@dcl/sdk` before writing. Rev 1 caught 3 wrong assumptions this way |
| **Silent `Storage` write loss** | High if unguarded | Every write checks its boolean and retries. In §7's definition of done |
| Server isolate killed by a limit | Medium | Design against §5; bounded loops; debounced writes |
| `auth-server` SDK branch is a prerelease | Medium | Pinned in `package.json`; revert path is a one-line version change |
| Nobody online when judges visit | **Certain** | **This is now the designed-for case, not an edge case** |
| Entity growth tanks FPS | Medium | Bounded render cap, deterministic subset |
| Scope creep | High | Sep 1 hard freeze; stretch list closed |
| **Disk full on the dev machine** | **Active** | Root filesystem at ~95%. Already caused a truncated download that crashed the Multiplayer Server with SIGBUS |
| **Dependency drift off the auth-server branch** | Was live, now fixed | SDK pinned EXACTLY (no caret) and `package-lock.json` committed. A caret on a prerelease let npm resolve onto any of 8 other builds, including stable ones with no Multiplayer Server APIs |

---

## 11. Reference links

Verified live Aug 20, 2026. `friendzone-buildathon-resources.md` has the full set — 16 links in
it are dead and still need the fixes identified separately.

- Multiplayer Server + Storage — https://docs.decentraland.org/creator/scenes-sdk7/networking/authoritative-servers
- Serverless multiplayer — https://docs.decentraland.org/creator/scenes-sdk7/networking/serverless-multiplayer
- Mobile safe areas — https://docs.decentraland.org/creator/build-for-mobile/develop/safe-area
- Mobile UI best practices — https://docs.decentraland.org/creator/build-for-mobile/develop/ui-best-practices
- Missing features on mobile — https://docs.decentraland.org/creator/build-for-mobile/mobile-client/missing-features
- Performance — https://docs.decentraland.org/creator/scenes-sdk7/optimizing/performance-optimization
- Publishing to Worlds — https://docs.decentraland.org/creator/scenes-sdk7/publishing/publishing-options

**Official SDK7 mobile reference scenes** — from `dcl-regenesislabs`, the buildathon organiser:
[cozy-farm](https://github.com/dcl-regenesislabs/cozy-farm) ·
[dead-surge](https://github.com/dcl-regenesislabs/dead-surge) ·
[kickoff-2026](https://github.com/dcl-regenesislabs/kickoff-2026) ·
[raft-game](https://github.com/dcl-regenesislabs/raft-game) ·
[towerofmadness](https://github.com/dcl-regenesislabs/towerofmadness) ·
[venetian-hunt](https://github.com/dcl-regenesislabs/venetian-hunt)

---

## 12. Priorities when things conflict

From `CLAUDE.md`. Lower number wins:

1. It works on a phone
2. It's comprehensible with zero instructions
3. It's social
4. It's finished
5. It's clever

**A small polished scene beats an ambitious broken one.** The organisers say this outright.
