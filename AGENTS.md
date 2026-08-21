# AGENTS.md

Canonical instructions for any AI coding agent working in this repository.
Claude Code reads `CLAUDE.md`, which defers to this file for all technical rules.

---

## 1. What this project is

**Project name:** Handshake
**World / NAME:** `handshake-dcl.dcl.eth` *(pending claim — verify on the Builder before first deploy)*

A Decentraland scene built for the **Friendzone Mobile Buildathon** (DCL Regenesis Labs, Aug 14 – Sep 4 2026).

The name carries both readings deliberately: the network protocol step where two parties must confirm each other before anything works, and the human gesture. Both are the point. Keep this in mind when naming systems, UI copy, and player-facing language — the vocabulary of connection, confirmation, and mutual acknowledgement is on-theme and free to use.

It is a **mobile-first social multiplayer experience** deployed to a Decentraland World. Judges will open it on a phone, alone or in pairs, with no instructions and no host present. Every technical decision serves that scenario.

**Stack:** Decentraland SDK7 · TypeScript · Creator Hub · (optional) Node.js authoritative server

---

## 1b. The game

> ⚠️ **NOT YET LOCKED.** The core mechanic is still being decided. Do not assume a design.
> Until this section is filled in, ask before building anything gameplay-specific.
> Everything else in this file is true regardless of what the game turns out to be.

**Decided so far:**
- Name: Handshake
- Must be social, mobile-first, and playable by strangers with no shared language
- Must work when a player arrives alone (a judge will)

**To fill in here once locked:** core loop · session length · player count (min/max) · win condition · what state is synced vs. server-owned · solo fallback behaviour.

---

## 2. Non-negotiable constraints

These come from the buildathon rules. Violating any one makes the submission **ineligible**, not merely worse.

| Constraint | Detail |
|---|---|
| **SDK7 only** | Never SDK6. See §3 — this is the #1 failure mode for AI agents. |
| **Deploy target** | Decentraland **World**, not LAND. Requires a NAME or ENS in `scene.json`. |
| **Open source** | Public GitHub repo. No secrets committed, ever. |
| **Social** | Must require or meaningfully reward interaction between players. Single-player = ineligible. |
| **Standalone** | Must work with no scheduled event, host, moderator, or performer. |
| **Mobile-first** | Touch controls, small screens. Desktop is not the target. |
| **Original** | No reuse of prior Decentraland competition entries. |

**Performance floor:** 30 FPS minimum on a low-end phone. This is a hard gate, not an aspiration.

---

## 3. SDK7 vs SDK6 — read this before writing any code

Most publicly available Decentraland code and documentation is **SDK6, which is obsolete**. Model training data is heavily contaminated with it. If you write SDK6 syntax, the scene will not compile and the error messages will not obviously point at the version mismatch.

**Red flags meaning you have written SDK6 — stop and rewrite:**

```ts
// ❌ ALL OF THIS IS SDK6. NEVER WRITE IT.
const box = new Entity()
box.addComponent(new BoxShape())
box.addComponent(new Transform({ position: new Vector3(8, 1, 8) }))
engine.addEntity(box)
box.addComponent(new OnPointerDown(() => {}))
```

```ts
// ✅ SDK7 — entity-component-system, components are namespaces, not classes
import { engine, Transform, MeshRenderer, MeshCollider, pointerEventsSystem, InputAction } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

const box = engine.addEntity()
Transform.create(box, { position: Vector3.create(8, 1, 8) })
MeshRenderer.setBox(box)
MeshCollider.setBox(box)

pointerEventsSystem.onPointerDown(
  { entity: box, opts: { button: InputAction.IA_POINTER, hoverText: 'Tap' } },
  () => { /* handler */ }
)
```

**Rules:**
- Components are accessed as `Component.create()`, `.getMutable()`, `.getOrNull()`, `.has()` — never `new Component()` or `entity.addComponent()`
- Entities are opaque numeric IDs from `engine.addEntity()` — never `new Entity()`
- Math types use `.create()` factories: `Vector3.create()`, `Color4.create()`, `Quaternion.fromEulerDegrees()`
- Logic lives in **systems** registered with `engine.addSystem()`, receiving `dt`
- Scene entry point is `export function main() {}` in `src/index.ts`
- UI is `@dcl/sdk/react-ecs` (JSX in `.tsx`), rendered via `ReactEcsRenderer.setUiRenderer()`

If you are unsure whether an API is SDK7, check the official docs or `node_modules/@dcl/sdk` types before writing. Do not guess.

---

## 4. Runtime environment limits

The scene runs in a **QuickJS sandbox**, not Node and not a browser.

**Unavailable — do not use:**
- `localStorage`, `sessionStorage`, `IndexedDB`, cookies
- `fs`, `path`, `process`, `child_process`, or any Node built-in
- `document`, `window`, DOM APIs
- `XMLHttpRequest`
- npm packages that depend on any of the above

**Available:**
- `fetch` and WebSocket — but **only via `@dcl/sdk/network`'s allowed transports**, and outbound domains must be declared in `scene.json` under `requiredPermissions` / `allowedMediaHostnames` where applicable
- `signedFetch` from `~system/SignedFetch` for authenticated server calls
- Standard ES built-ins (Math, JSON, Promise, etc.)

**Persistence:** there is no client-side storage. Anything that must survive a session lives on the authoritative server.

---

## 5. Multiplayer rules

Three options, in ascending order of cost. Use the cheapest one that satisfies the design.

1. **`syncEntity`** (`@dcl/sdk/network`) — no server, easiest, state dies when the last player leaves
2. **`MessageBus`** (`@dcl/sdk/message-bus`) — explicit emit/listen, no server
3. **Authoritative server** — required when there is any incentive to cheat (leaderboards, prizes, scoring)

**Hard gotchas — these cause bugs that are very hard to diagnose:**

- **`entityEnumId` must be unique and below 8001.** Creator Hub auto-assigns Smart Item IDs from 8001 upward. Collisions cause silent, incorrect state sync. Keep all manual IDs in a single `enum` in one file.
- **Use `parentEntity()` from `@dcl/sdk/network`, not `Transform.parent`,** for any entity that is synced or has synced children. `Transform.parent` holds a *local* entity id that differs per client.
- **Sync only components that actually change.** Never sync `MeshRenderer`, `MeshCollider`, or a static `Transform`.
- **Scope all server state per realm.** Players in different realms/islands must not share state, or they will see changes nobody made. Get the realm via `getRealm()` from `~system/Runtime`.
- **Never trust the client.** Score, timing, and win conditions are validated server-side or they are exploitable.

**Testing multiplayer locally:** click Preview twice in Creator Hub to open two explorer windows, and log in with **different wallet addresses** in each. Same-address windows will not behave as two players.

---

## 6. Mobile UI rules

The mobile client **reserves screen regions for its own controls**. Scene UI placed there is unusable and reads to a judge as a broken scene.

```
┌─────────────────────────────────┐
│  ⛔ ← reserved      SAFE        │
│  ⛔                              │
│  ⛔ joystick        SAFE        │
│  ⛔                              │
│  ⛔            ⛔ chat/profile/ │
│  ⛔            ⛔ interact      │
└─────────────────────────────────┘
```

- **Left edge** → movement joystick
- **Bottom-right corner** → chat, profile, interaction button

**Therefore:**
- Anchor scene UI to **top-center, top-right, or center**. Never bottom-right, never left edge.
- Minimum touch target ~44px equivalent. No small tap targets.
- No hover states, no right-click, no keyboard shortcuts, no drag gestures, no double-tap. **Single tap only.**
- Font sizes must be legible on a ~5-inch screen — err large.
- Prefer icons over text where possible; the audience is international and multilingual.
- Onboarding must work **without reading** — a player should understand the goal in under 15 seconds.

**UI performance:** hidden UI elements still cost performance. Build UI on demand and unmount it rather than keeping it mounted and invisible.

---

## 7. Performance rules

The primary bottleneck is **message volume between scene code and the engine**, not raw rendering.

- Do not mutate components every frame. Throttle, or only write when a value actually changed.
- Do not send network messages per frame. Batch and rate-limit.
- Avoid blended transparency (bypasses render optimizations); prefer opaque or alpha-tested.
- Avoid skinned meshes — they are expensive.
- Share textures across models; use a texture atlas. This is the single biggest draw-call win.
- All models must be **glTF/GLB**. `.fbx` is not supported.
- Ship `.glb` with **external** texture files (the engine cannot dedupe embedded textures).

**Verification:** `Y` toggles the debug panel in preview; `/showfps` in chat on a deployed scene. Watch "Pending on Queue" — if it grows, stop adding features and optimize.

---

## 8. Repository layout

```
/
├── AGENTS.md              # this file
├── CLAUDE.md              # Claude Code specifics → defers here
├── README.md              # judge-facing. Keep current.
├── scene.json             # world config, spawn points, permissions, feature toggles
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts           # main() entry point — keep thin, delegate
│   ├── config.ts          # tunable constants. No magic numbers elsewhere.
│   ├── sync-ids.ts        # THE single enum of entityEnumIds (all < 8001)
│   ├── systems/           # one file per system
│   ├── entities/          # scene construction
│   ├── ui/                # .tsx react-ecs components
│   └── net/               # server client, message schemas
├── assets/                # .glb models, audio
└── server/                # authoritative server, if used (separate deploy)
```

---

## 9. Commands

```bash
npm install              # install deps
npm run start            # local preview (or use Creator Hub Preview button)
npm run build            # typecheck + build
npx tsc --noEmit         # typecheck only — run before every commit
```

Deployment happens through **Creator Hub → Publish → PUBLISH TO WORLD**. Do not attempt to script deployment without being asked.

---

## 10. Working agreements

**Before writing code:**
- Read the existing files you are about to modify. Do not assume structure.
- If a Decentraland API is involved and you are not certain of the SDK7 signature, verify against `node_modules/@dcl/sdk` types or official docs first.

**When writing code:**
- TypeScript strict. No `any` unless genuinely unavoidable, and comment why.
- No new dependencies without asking — the QuickJS sandbox breaks most npm packages.
- No secrets, keys, or wallet private data in the repo. Ever. The repo is public.
- Keep `README.md` accurate as features land; judges read it.

**After writing code:**
- Run `npx tsc --noEmit`. A green typecheck is the minimum bar for "done".
- State clearly what you did **not** test. Do not claim mobile verification you did not perform — only a human with a phone can confirm that.

**Scope discipline:** this is a 3-week hackathon. Prefer the smallest thing that works. If a request would meaningfully expand scope, say so before building it.

---

## 11. Definition of done

A feature is not done until:

- [ ] `npx tsc --noEmit` passes clean
- [ ] Tested in preview with **two** explorer windows on different addresses (if it touches multiplayer)
- [ ] Tested on a **real phone** in the Decentraland mobile app
- [ ] No UI in the reserved left-edge or bottom-right zones
- [ ] Holds 30+ FPS on the test phone
- [ ] Comprehensible to a first-time player with no explanation
- [ ] Degrades sanely when the player is alone, and when the server is unreachable

---

## 12. Known failure modes to avoid

Ranked by how often they actually happen:

1. **Writing SDK6 code.** See §3. Highest-probability failure by a wide margin.
2. **`entityEnumId` ≥ 8001 colliding with Smart Items.** Silent, confusing sync bugs.
3. **Using `Transform.parent` on synced entities.** Works in preview, breaks with real players.
4. **Placing UI in reserved mobile zones.** Invisible on desktop, fatal on mobile.
5. **Reaching for `localStorage` or Node APIs.** Not available in the sandbox.
6. **Per-frame component writes or network sends.** Passes preview, tanks on a phone.
7. **Trusting client-reported scores.** Trivially exploitable.
8. **Assuming other players are present.** A judge will open this alone. Handle it.
