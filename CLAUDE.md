# CLAUDE.md

Guidance for Claude Code working in this repository.

> **All technical rules live in [`AGENTS.md`](./AGENTS.md).** Read it first, in full, before touching code. This file covers only Claude Code–specific workflow. If the two ever conflict, `AGENTS.md` wins.

---

## Project in one line

**Handshake** — a mobile-first social multiplayer Decentraland **SDK7** scene, deployed to the World `handshakedcl.dcl.eth`, for the Friendzone Mobile Buildathon (deadline **Sep 4, 2026**).

The core mechanic is **not yet locked** (see `AGENTS.md` §1b). Don't assume a design or start building gameplay systems without confirming with me first.

---

## The one thing to get right

**This is SDK7. Your training data is full of SDK6.**

If you find yourself writing `new Entity()`, `.addComponent()`, `new BoxShape()`, `new Vector3()`, or `OnPointerDown`, you have written obsolete code that will not compile. Stop and re-read `AGENTS.md` §3.

When uncertain about any Decentraland API signature, check `node_modules/@dcl/sdk` types **before** writing, not after the build fails. Guessing here costs more time than checking.

---

## Session start checklist

At the beginning of any non-trivial task:

1. Read `AGENTS.md` fully
2. Read `src/config.ts` and `src/sync-ids.ts` — they hold the constants and entity IDs everything else depends on
3. Read the specific files you intend to modify before proposing changes
4. Confirm scope with me if the task is ambiguous or looks like it will grow

---

## How to work here

**Plan first on anything non-trivial.** For multi-file changes, new systems, or anything touching networking, outline the approach and wait for confirmation. For a one-line fix, just do it.

**Small diffs.** Prefer several reviewable changes over one large one. This is a three-week project with a hard deadline — an unreviewable 800-line diff on day 18 is a liability.

**Verify before claiming done.** Run `npx tsc --noEmit`. If it doesn't pass, the work isn't finished.

**Be explicit about what you did not verify.** You cannot test on a phone. You cannot test with two live players. Say so plainly rather than implying the work is validated. I would much rather hear "typechecks, untested on device" than a confident summary that turns out to be wrong at 2am before the deadline.

**Push back on scope.** If I ask for something that will take more time than it's worth given the deadline, or that risks the performance budget, say so before building it. Agreement isn't helpful if the thing ships broken.

**Don't invent APIs.** If a Decentraland feature I'm asking for may not exist, tell me it may not exist rather than writing plausible-looking code against an imagined API. This has a real cost here — the docs are inconsistent across SDK versions and a fabricated method call can eat hours.

---

## Commands

```bash
npm install
npm run start          # local preview
npx tsc --noEmit       # typecheck — run before every commit
npm run build
```

Deployment is manual via **Creator Hub → Publish → PUBLISH TO WORLD**. Don't script or trigger deploys unless I explicitly ask.

---

## Testing you can and can't do

| Check | Who |
|---|---|
| Typecheck / build | You |
| Code review against `AGENTS.md` rules | You |
| Logic review (sync IDs, realm scoping, per-frame writes) | You |
| Preview in explorer | Me |
| Two-window multiplayer test | Me |
| **Real phone in the mobile app** | **Me — always** |
| FPS on a low-end device | Me |

When you finish something, tell me specifically what I need to test on device. That handoff is the useful output, not a summary of what you wrote.

---

## Repo hygiene

- The repo is **public** — open source is an eligibility requirement. Never commit keys, wallet data, `.env` contents, or anything private.
- Keep `README.md` current as features land. Judges read it, and it's part of what's being evaluated.
- Don't add dependencies without asking. The QuickJS sandbox breaks most npm packages (`AGENTS.md` §4).

---

## Priorities, in order

1. **It works on a phone.** Everything else is secondary.
2. **It's comprehensible with zero instructions.** A judge taps around for 90 seconds and forms an opinion.
3. **It's social.** Interaction between players is the point, not a feature.
4. **It's finished.** A small polished scene beats an ambitious broken one — the organizers say this explicitly in the judging criteria.
5. **It's clever.** Last, genuinely. Novelty that doesn't ship scores zero.

When these conflict, the lower number wins.
