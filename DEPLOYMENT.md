# Deploying Handshake

Everything needed to get this scene live on a Decentraland World, in order.

> **Publishing is free.** No gas, no blockchain transaction. The only thing that
> costs money is owning a NAME — see step 1.

---

## 1. Prerequisite: you must own a NAME ⚠️

**This is the only hard blocker, and it is worth checking first.**

A Decentraland World lives at a NAME you own. The docs are explicit:

> The `name` must be **owned by the wallet signing the deployment**, or by a wallet
> that has granted deploy permission via ACL.

**Check what you own:** https://builder.decentraland.org/names (connect your wallet)

| Situation | What to do |
|---|---|
| You own a NAME | Set `worldConfiguration.name` in `scene.json` to it **exactly** |
| You own none | Claim one for **100 MANA** at the link above, or buy a minted one on the marketplace |
| You own an ENS `.eth` domain | That works too — use it instead |

### Current status: permission granted

The Buildathon organisers granted **deployer and streamer permission** to
**`maincharacter.dcl.eth`** for the wallet
`0x3660362beb3a95ce16d981e7d30e1e025e741393`, for the duration of the Buildathon.
No NAME purchase is needed.

Two consequences worth knowing:

- **It is not your World.** Permission is granted, not owned, and it is scoped to
  the Buildathon. Eligibility requires the scene to stay reachable throughout
  judging (Sept 5–11), so check it is still live during that window.
- **Others may share it.** If another participant deploys to the same World
  without `--multi-scene`, an ordinary deploy replaces what is there. The World
  was empty when this scene first targeted it, but it is worth re-checking:

  ```bash
  curl https://worlds-content-server.decentraland.org/world/maincharacter.dcl.eth/about
  ```

### This project's target

`scene.json` targets **`maincharacter.dcl.eth`**, from the NAME **`HandShakeDcl`**.

**World names are lowercase.** Checked against the live index: of 1582 deployed
worlds, **zero** contain an uppercase character. So a NAME registered as
`HandShakeDcl` produces the world `maincharacter.dcl.eth`, and that lowercase form
is what must appear in `scene.json` — regardless of how it looks in the Builder.

Note it has **no hyphen**. An earlier draft targeted `handshake-dcl.dcl.eth`, which
is a different name entirely and would have failed to deploy.

For reference: `handshake.dcl.eth` (no suffix) is already owned by someone else.

If the Builder shows you own something different, edit `scene.json` before deploying:

```json
"worldConfiguration": { "name": "your-actual-name.dcl.eth" }
```

Nothing in the build or tests can catch a name you don't own — the failure appears
at deploy time as a signature/permission rejection.

---

## 2. Preflight

```bash
npm run preflight
```

Runs a production build and checks everything checkable beforehand:

- **Hard limits that block a deployment** — file count, total size, per-file size
- Every file `scene.json` references actually exists
- World name and `authoritativeMultiplayer` are set
- **The bundle is not a dev build**

That last check matters more than it sounds. `sdk-commands deploy` has no
`--production` flag and rebuilds by default, so it is easy to ship the development
bundle: **5669 KB against 463 KB**, almost all of it an inline sourcemap every
visitor downloads before anything renders. Preflight fails the run if it sees one.

Expected output: `Preflight passed — 5 files, 0.56 MB`

---

## 3. Deploy

### Option A — Creator Hub (recommended)

1. Open the project in Creator Hub
2. **Publish → PUBLISH TO WORLD**
3. Pick your NAME
4. Sign in your wallet

### Option B — CLI (works on Linux, no desktop client needed)

```bash
npm run build:prod
npm run deploy -- --target-content https://worlds-content-server.decentraland.org
```

A browser opens for you to sign. Do **not** use a plain `npm run deploy` without
building for production first — it will rebuild in dev mode.

> Publishing the scene publishes the **Multiplayer Server** with it. There is no
> separate hosting step and no extra cost.

---

## 4. Verify it is live

```
/goto maincharacter.dcl.eth        (in Decentraland chat)
decentraland://?realm=maincharacter.dcl.eth
```

Or check the content server directly:

```bash
curl https://worlds-content-server.decentraland.org/world/YOUR-NAME.dcl.eth/about
```

An undeployed world returns `"has no scenes deployed"`.

---

## 5. The tests that only work in production

Three behaviours **cannot be reproduced in local preview**. They are the reason
deploying early matters.

### Cold start — the one a judge will hit

The Multiplayer Server shuts down about **two minutes after the last player
leaves**, and a cold start takes roughly **15 seconds**. Messages sent while it
boots are **silently lost**. Local preview starts the server instantly, so none of
this ever appears until you publish.

**Test:** wait 3+ minutes with nobody in the world, then enter on a phone.

- Does the 🌐 waking indicator appear, and then clear?
- Or does the scene just look broken for fifteen seconds?

### Persistence across an empty world

This is the entire thesis of the scene.

**Test:** leave a hand (✋). Close the app completely. Wait 5 minutes so the server
shuts down. Come back.

- Is your hand still there?
- Does the lattice still show previous links?

### Two players, two wallets

**Test:** two devices, two different wallets, standing together. Both tap 🤝 within
a few seconds.

- Does exactly **one** link appear, not two?
- Does it appear for **both** players?

---

## 6. Server logs

To read `console.log` from the Multiplayer Server in production, add your wallet
to `scene.json` at root level:

```json
"logsPermissions": ["0xYourWalletAddress"]
```

Then:

```bash
npm run server-logs
```

Worth doing before the first deploy — the server prints a
`PERSISTENCE DEGRADED` line if any Storage write permanently fails, and that is
the failure you most want to see rather than guess at.

---

## 7. Keep it live through judging

Eligibility requires the scene to be **publicly accessible throughout judging
(Sept 5–11)**. Do not unpublish, rename, or let the NAME lapse in that window.

Re-deploying is free and repeatable, so shipping now and improving later costs
nothing. The thumbnail in particular can be replaced with a later deploy.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Signature rejected / permission error | The signing wallet does not own the NAME in `scene.json` |
| Deploy blocked on size or file count | Hard limit exceeded — run `npm run preflight` |
| Scene loads slowly on mobile | Dev bundle shipped; rebuild with `npm run build:prod` |
| Scene is blank for ~15 s on first visit | Expected cold start — check the 🌐 indicator appears |
| Hands/links vanish between sessions | Storage writes failing — check `npm run server-logs` |
| Creator Hub warns about materials | Soft limit (`log2(n+1)×20` = 20 for one parcel). A warning and a frame-rate cost, not a failure. Tune `LINK_SLOT_COUNT` / `HAND_SLOT_COUNT` in `src/config.ts` |
