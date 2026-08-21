# Friendzone Mobile Buildathon — Resource & Tech Stack Reference

**Organizer:** DCL Regenesis Labs (execution arm of the Decentraland DAO)
**Build phase:** August 14 – September 4, 2026 (3 weeks)
**Submission deadline:** September 4, 2026 · **Judging:** Sept 5–11 · **Winners:** Sept 13, 2026
**Prize pool:** $8,000 MANA (1st $3,000 · 2nd $2,000 · 3rd $1,500 · 4th $1,000 · 5th $500)

> ⚠️ **Verification note:** Every link below marked ✅ was confirmed live. Links marked ⚠️ are referenced in the official brief but I could not verify an exact URL — get these directly from the organizer's brief or the Discord channel before relying on them.

---

## 1. Event & Submission

| Resource | Link | Status |
|---|---|---|
| DoraHacks hackathon page (submit here) | https://dorahacks.io/hackathon/friendzone/detail | ✅ |
| Official forum announcement thread | https://forum.decentraland.org/t/friendzone-buildathon-news-updates-announcements/25353 | ✅ |
| DCL Regenesis Labs forum category | https://forum.decentraland.org/c/regenesis-labs/18 | ✅ |
| Eventbrite listing | https://www.eventbrite.com/e/decentraland-friendzone-mobile-buildathon-tickets-1997326657800 | ✅ |
| Regenesis Labs on X | https://x.com/RegenesisLabs | ✅ |
| Friendzone Buildathon Terms & Conditions | — | ⚠️ get from brief |
| Decentraland Discord (`#friendzone` channel) | https://decentraland.org/discord | ⚠️ verify invite |

**DoraHacks submission mechanics** (from their generic guide — confirm specifics on the Friendzone page):
- Click "Create new BUIDL", fill in project details, include full `https://` URLs for demo + repo
- Add your GitHub link **before** the deadline — you can submit first and keep editing until deadline
- Submission requires organizer approval before appearing publicly in the BUIDL gallery
- Guide reference: https://dorahacks.io/hackathon/the-support-buildathon/submission ✅

---

## 2. Hard Submission Requirements (checklist)

- [ ] Scene deployed to a **Decentraland World** (not LAND), publicly accessible throughout judging
- [ ] Creates **meaningful social interaction** (empty venues / pure single-player = ineligible)
- [ ] Works as a **persistent standalone experience** — no scheduled event, host, performer, or moderator required
- [ ] Designed and tested for **mobile / touch / small screens**
- [ ] **Open source** in a public GitHub repository
- [ ] Submitted via **DoraHacks** before Sept 4
- [ ] **Original** — not used in past Decentraland competitions
- [ ] Complies with Buildathon T&Cs + Decentraland Terms of Use

**Judging criteria:** Mobile-First Experience · Social Value · Mobile UX & Accessibility · Performance & Optimization · Creativity & Originality · Retention & Discovery Value · Overall Execution

> Judges test **every eligible project directly in the Decentraland Mobile App.** A simple, polished, enjoyable mobile experience can outscore a technically complex one that performs poorly or is hard to understand.

---

## 3. Core Creation Tools

| Tool | Link | Status |
|---|---|---|
| Creator Hub (download) | https://decentraland.org/download/creator-hub/ | ✅ |
| Creator Hub — installation docs | https://docs.decentraland.org/creator/scene-editor/get-started/editor-installation | ✅ |
| Creator Hub — source repo | https://github.com/decentraland/creator-hub | ✅ |
| Creator Hub docs hub | https://docs.decentraland.org/creator | ✅ |
| Scene Editor guide | https://docs.decentraland.org/categories/scene-editor/ | ✅ |
| Smart Items (no-code interactivity) | https://docs.decentraland.org/creator/smart-items/ | ✅ |
| Builder (claim NAMEs, manage Worlds) | https://github.com/decentraland/builder | ✅ |
| OpenDCL — AI agent for SDK7 scene building | https://github.com/dcl-regenesislabs/opendcl | ✅ |

**Note on Creator Hub + code editor:** the VS Code Decentraland extension is **deprecated**. Use Creator Hub alongside plain VS Code or Cursor.

---

## 4. Decentraland Apps (for testing)

| Platform | Link | Status |
|---|---|---|
| Mobile app overview | https://docs.decentraland.org/mobile-app/mobile-app | ✅ |
| Mobile troubleshooting | https://docs.decentraland.org/mobile-app/troubleshooting | ✅ |
| Android / iOS / Windows / Mac downloads | https://decentraland.org/download/ | ⚠️ verify path |

iOS is also available via **TestFlight** for early access builds.

---

## 5. Scene Creation Docs (SDK7)

| Topic | Link | Status |
|---|---|---|
| SDK Quick Start | https://docs.decentraland.org/creator/scenes-sdk7/getting-started/sdk-101 | ✅ |
| Coding essentials | https://docs.decentraland.org/creator/scenes-sdk7/getting-started/coding-scenes | ✅ |
| Development workflow | https://docs.decentraland.org/creator/development-guide/sdk7/dev-workflow/ | ✅ |
| Preview your scene | https://docs.decentraland.org/creator/development-guide/preview-scene/ | ✅ |
| Scene metadata (`scene.json`) | https://docs.decentraland.org/creator/development-guide/sdk7/scene-metadata/ | ✅ |
| 2D UI overview | https://docs.decentraland.org/creator/development-guide/sdk7/onscreen-ui/ | ✅ |
| Dynamic UIs | https://docs.decentraland.org/creator/development-guide/sdk7/dynamic-ui/ | ✅ |
| Player data / `getPlayer()` | https://docs.decentraland.org/creator/development-guide/sdk7/user-data/ | ✅ |
| Event listeners (`onEnterScene` / `onLeaveScene`) | https://github.com/decentraland/docs/blob/main/creator/sdk7/interactivity/event-listeners.md | ✅ |
| Runtime data / realms & islands | https://docs.decentraland.org/creator/development-guide/sdk7/runtime-data/ | ✅ |
| SDK7 example scenes | https://docs.decentraland.org/creator/sdk7/examples/7/ | ✅ |
| SDK7 library catalog | https://docs.decentraland.org/creator/sdk7/libraries/7/ | ✅ |
| SDK7 Utils library | https://github.com/decentraland/sdk7-utils | ✅ |
| Awesome-Repository (examples index) | https://github.com/decentraland-scenes/Awesome-Repository | ✅ |
| Studios resources (latest SDK7 examples) | https://studios.decentraland.org/resources | ⚠️ referenced, verify |
| Full docs index for LLMs | `llms.txt` — linked from any docs.decentraland.org page | ✅ |

---

## 6. Multiplayer / Networking (critical for "Social Value")

| Topic | Link | Status |
|---|---|---|
| Serverless multiplayer (`syncEntity`) | https://docs.decentraland.org/creator/scenes-sdk7/networking/serverless-multiplayer | ✅ |
| Same doc, raw markdown | https://github.com/decentraland/docs/blob/main/creator/sdk7/networking/serverless-multiplayer.md | ✅ |
| Authoritative servers | https://docs.decentraland.org/creator/scenes-sdk7/networking/authoritative-servers | ✅ |
| Multiplayer scene considerations | https://docs.decentraland.org/creator/development-guide/sdk7/remote-scene-considerations/ | ✅ |
| Leaderboard UI example (SDK7) | https://github.com/decentraland-scenes/leaderboard-ui-sdk7 | ✅ |
| Leader-Board scene example | https://github.com/decentraland-scenes/Leader-Board | ✅ |
| Multiplayer Server Leaderboard (org-linked) | — | ⚠️ get exact repo from brief |
| Architecture: Archipelago / islands | https://docs.decentraland.org/contributor/architecture/services | ✅ |
| Platform architecture overview | https://docs.decentraland.org/contributor/introduction/architecture/ | ✅ |

**Three sync options, in increasing order of effort:**
1. **`syncEntity`** — mark entities synced, no server. Easiest. State lost when all players leave.
2. **MessageBus** — manual `.emit()` / listen for explicit messages. No server.
3. **Authoritative server** — recommended when there are incentives to exploit (leaderboards, prizes). Server owns state, validates, persists, broadcasts.

**Key gotchas:**
- `entityEnumId` must be unique; **avoid IDs ≥ 8001** if the scene uses Smart Items (Creator Hub auto-assigns from 8001 up).
- Use `parentEntity()` instead of the `Transform.parent` property for synced entities.
- Sync **only components that change** — never static Transforms/MeshRenderers.
- **Scope server state per realm**, or players see unexplained "spooky" changes.
- Local multiplayer testing: click Preview twice in Creator Hub, log in with **different addresses** in each window.

---

## 7. Mobile-Specific Constraints (highest-value section)

**Reserved screen zones — your custom UI must NOT overlap these:**
- **Left side** → movement joystick
- **Bottom-right corner** → chat, profile, interaction button

Scene UI that overlaps these is explicitly flagged in Decentraland's own troubleshooting docs as "not yet updated for mobile" — i.e. judges will read it as a defect.

| Topic | Link | Status |
|---|---|---|
| Performance optimization | https://docs.decentraland.org/creator/development-guide/sdk7/performance-optimization/ | ✅ |
| UX & UI guide (design values) | https://docs.decentraland.org/creator/scenes-sdk7/designing-the-experience/ux-ui-guide | ✅ |
| Settings & performance (player-side) | https://docs.decentraland.org/in-world/settings-and-performance | ✅ |
| Building for Mobile (docs section) | https://docs.decentraland.org/creator/scenes-sdk7/ → "Building for Mobile" | ⚠️ nav section |
| Mobile Preview / Sample Mobile Scenes / Mobile UI / Customize Mobile Controls | — | ⚠️ get exact URLs from brief |

**Performance targets & rules:**
- Target **30+ FPS minimum**
- `/showfps` in chat toggles metrics in a deployed scene; `Y` toggles the debug panel in preview
- Main bottleneck = **messages between scene code and engine** — batch updates, don't sync per frame
- Watch "Pending on Queue" — if it grows, you're in the danger zone
- Avoid **many hidden UI elements** (they cost even when not rendered) — create UI on demand
- Avoid **blended transparencies** (bypass rendering optimizations) and **skinned meshes** (heavy)
- Preview performance ≠ production performance — deploy to test env early

**Design values to design against:** Welcoming · User-friendly · Easy to learn · Providing guidance · Reactive · Minimalistic

---

## 8. 3D Assets & Art Pipeline

| Resource | Link | Status |
|---|---|---|
| 3D model essentials (glTF/GLB) | https://docs.decentraland.org/creator/3d-modeling/3d-models/ | ✅ |
| Textures & optimization | https://docs.decentraland.org/creator/3d-modeling-and-animations/textures | ✅ |
| Decentraland Tools for Blender (add-on) | https://extensions.blender.org/add-ons/decentraland-tools/ | ✅ |
| Blender toolkit source | https://github.com/decentraland/dcl-blender-toolkit | ✅ |
| Asset Packs (official catalog source) | https://github.com/decentraland/asset-packs | ✅ |
| CC0 open-source 3D asset registry (991+ GLB) | https://github.com/ToxSam/open-source-3D-assets | ✅ |
| gltfpack / meshoptimizer | https://meshoptimizer.org/gltf/ | ✅ |
| DCL collider toolkit (community Blender plugin) | https://github.com/stom66/blender-addon-dcl-collider-toolkit | ✅ |
| OpenDCL Asset Catalog (8,800+ assets) | — | ⚠️ get from brief |
| Genesis Plaza `.blend` file | — | ⚠️ get from brief |
| Stom's Genesis Plaza Asset Repository | — | ⚠️ get from brief |
| Procedural Landscaping Assets | — | ⚠️ get from brief |
| Decentraland Scene Optimizer | — | ⚠️ get from brief |
| Blender MCP Server | — | ⚠️ get from brief |

**Blender add-on capabilities** (useful to know): real-time scene-limit checking (triangles, entities, materials, textures, height), PBR atlas optimizer merging 2–4 materials into one atlas to cut draw calls, collider workflow tooling, and official avatar base mesh import.

**Art rules that matter:**
- All models must be **glTF** (`.gltf` or `.glb`). `.fbx` is **not** supported — convert via Blender.
- Work in `.gltf` while developing, ship `.glb` for size.
- **Share textures across models** (texture atlas / trim sheets) — biggest draw-call win.
- `.glb` embeds textures by default; the engine can't dedupe embedded textures — extract to external files sharing a hash.
- Content servers auto-compress models to asset bundles ~daily after deployment.

---

## 9. Worlds & Publishing

| Topic | Link | Status |
|---|---|---|
| Worlds overview | https://docs.decentraland.org/creator/worlds/about/ | ✅ |
| Publishing guide | https://docs.decentraland.org/creator/scenes-sdk7/publishing/publishing | ✅ |
| Publishing (dev guide version) | https://docs.decentraland.org/creator/development-guide/sdk7/publishing/ | ✅ |

**Critical prerequisites — sort these in week 1:**
- A World requires owning a **Decentraland NAME or an ENS domain**
- Each NAME grants **100 MB storage** + one World
- Worlds support up to **100 concurrent users**
- Set the target in `scene.json`:
  ```json
  { "worldConfiguration": { "name": "my-name.dcl.eth" } }
  ```
- The signing wallet must own the NAME, or have permission via **ACL**
- Publish flow: Creator Hub → Publish → **PUBLISH TO WORLD** → select NAME/ENS
- Set `tags` and `rating` (T for Teens / A for Adults) in scene metadata for discoverability

**Useful `scene.json` feature toggles:** voice chat enable/disable, and **Disable Portable Experiences** — worth setting for competitive scenes so smart wearables (e.g. a jetpack) can't give unfair advantage or spoof your scene UI.

---

## 10. Tech Stack for This Build

**Core (non-negotiable)**
- **Creator Hub** — scene authoring, preview, publish
- **SDK7 + TypeScript** — entity-component-system architecture
- **VS Code or Cursor** — code editing
- **Git + public GitHub repo** — required for eligibility
- **Decentraland World** — deployment target (needs NAME/ENS)
- **Decentraland Mobile App** — the actual test target

**Multiplayer layer** (pick based on design)
- `@dcl/sdk/network` → `syncEntity()` for simple shared state
- `@dcl/sdk/message-bus` → `MessageBus` for explicit events
- **Node.js + WebSockets** (or Colyseus) for an authoritative server if you need validation, persistence, or a cheat-resistant leaderboard

**Art pipeline**
- Blender + **Decentraland Tools** add-on
- glTF/GLB export → gltfpack / glTF-pipeline for compression
- OpenDCL / CC0 catalogs for pre-made assets
- Texture atlasing to minimize draw calls

**Optional accelerators**
- **OpenDCL** CLI agent (Regenesis Labs' own tool — knows SDK7, validates TypeScript, handles multiplayer sync and deployment config, ships 20 built-in skills and free asset catalogs)
- Blender MCP server for AI-assisted modeling

---

## 11. Support Channels

- Decentraland Discord — `#friendzone` (buildathon-specific), `#sdk` (code), `#builder-and-3d` (art)
- Decentraland DAO Discord
- Forum SDK Support category: https://forum.decentraland.org ✅
- Stack Overflow tags: `decentraland`, `decentraland-ecs`
- Official help: https://decentraland.org/help ✅
- Workshop recordings shared after each live session

---

## 12. Post-Buildathon Pathways

- **DCL Regenesis Labs Grants Program — Season 2**
- **Decentraland Foundation Creator Success Program**
- Top 10 projects may be featured in **Decentraland Mobile App Discover** (subject to technical compatibility, continued accessibility, and content requirements)

*Further support is not guaranteed — depends on project quality, potential, program requirements, and available capacity.*

---

## Immediate Action Items

1. **Acquire a Decentraland NAME or ENS domain** — you cannot deploy to a World without one. Blocking dependency.
2. **Install Creator Hub + VS Code/Cursor**, run a template scene, publish a throwaway build to your World end-to-end. Prove the pipeline before writing real code.
3. **Install the Decentraland mobile app** on the lowest-end phone you can access — that's your real test device, not your desktop.
4. **Join the Discord `#friendzone` channel** and grab the verified URLs for every ⚠️ item above.
5. **Set up the public GitHub repo on day one** with a real README — eligibility depends on it, and judges read it.
