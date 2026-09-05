# Submission — Friendzone Mobile Buildathon

Everything needed to submit on DoraHacks, prepared so the submission itself is
copy-paste. **Deadline: Sept 4, 2026.** Judging Sept 5–11.

> Submit early. DoraHacks lets you edit a BUIDL right up to the deadline, and
> submissions need organiser approval before appearing publicly — so a late
> submission risks the approval queue, not just the clock.

---

## 1. Hard requirements

| Requirement | Status |
|---|---|
| Deployed to a Decentraland **World** (not LAND), publicly reachable through judging | ⬜ **Blocked on the NAME** — `scene.json` targets `maincharacter.dcl.eth` |
| Creates **meaningful social interaction** (empty venues / pure single-player = ineligible) | ✅ Every mark in the world was left by a real person; nothing is simulated |
| **Persistent standalone** — no scheduled event, host, or moderator | ✅ This is the scene's entire premise |
| Designed and tested for **mobile / touch / small screens** | ✅ built for it · ⬜ device testing is yours |
| **Open source** in a public GitHub repo | ✅ `UjjwalCodes01/handshake-dcl`, MIT |
| Submitted via **DoraHacks** before Sept 4 | ⬜ |
| **Original**, not used in past Decentraland competitions | ✅ |
| Complies with Buildathon T&Cs + Decentraland Terms | ✅ |

The eligibility line worth reading twice: *"empty venues / pure single-player =
ineligible."* This scene is built precisely against that failure — a visitor
alone is still interacting with real people, just not simultaneously.

---

## 2. DoraHacks fields

**Title**

```
Handshake
```

**Tagline**

```
Meet a stranger. Confirm each other. Build something neither of you could alone.
```

**Demo / live URL**

```
https://decentraland.org/play/?realm=maincharacter.dcl.eth
```

**Repository**

```
https://github.com/UjjwalCodes01/handshake-dcl
```

**Description**

```
Most social scenes have the same failure: they need two people online at the
same moment. A world with no scheduled event is empty almost all of the time,
so a visitor arrives, finds nobody, and leaves. The mechanic never fires —
they don't see a worse version of the experience, they see nothing at all.

Handshake works when you are the only person there.

The world is scattered with pending handshakes: a hand left extended, frozen,
by a real previous visitor. You walk up and complete it. The two marks fuse
into a permanent link in the central lattice, and the person who left it is
told they were answered when they next return. Before you leave, you extend
your own hand for whoever comes next.

Every visitor receives and gives. Every mark belongs to a real person — there
are no fake visitors and no bot hands. When someone else does happen to be
present, you can shake hands with them live for a brighter, rarer link.

One tap is the entire interaction vocabulary. There is no text to read in any
state: a glowing marker points a first-timer at their first handshake and
disappears once they have made it, progress is shown in icons and pips, and the
whole scene runs on Decentraland's shared clock — after dark the ground falls
away and the lattice becomes the only light in the world.

Built mobile-first on SDK7 with an authoritative Multiplayer Server, zero
runtime dependencies, a 474 KB bundle, and 195 tests.
```

---

## 3. Against the judging criteria

Judges test **every eligible project directly in the Decentraland Mobile App**,
and the brief says plainly that a simple, polished, enjoyable mobile experience
can outscore a technically complex one that performs poorly or is hard to
understand.

| Criterion | What the scene actually does |
|---|---|
| **Mobile-First** | One tap, ever. Nothing drawn in the joystick or chat zones. No particles, dynamic lights, or world-space text — all missing or broken on the mobile client, so the scene uses emissive materials and 2D UI instead. |
| **Social Value** | The mechanic *is* the social interaction. Both participants are credited; a handshake is not something one person does. Server requires two independent claims, so consent cannot be forged. |
| **Mobile UX** | No text in any state. A marker points newcomers at their first handshake, then vanishes. Oversized touch target, single action offered at a time. |
| **Performance** | 118 entities, all pre-allocated. One 5 Hz system. No per-tick component writes, no per-frame allocation. 474 KB production bundle. |
| **Creativity** | Asynchronous social contact — the scene treats *being alone* as the designed case rather than a failure mode. |
| **Retention** | You are told how many of your hands were answered while away. A roll of the most-connected, with your own standing. The anchor grows with the world's history. |
| **Execution** | 195 tests, zero dependencies, reproducible install, green CI, MIT licensed. |

---

## 4. The 90-second walkthrough

What a judge will do, in order. Worth walking yourself before submitting.

1. **Arrive.** Spawn faces the anchor. If the world has been quiet the 🌐 marker
   appears while the server wakes — roughly 15 seconds, and only in production.
2. **Follow the ◆.** It floats over the nearest hand a newcomer can answer.
3. **Tap 🤝.** A link joins the lattice, the avatar waves, the counter rises.
4. **Walk into the lattice.** Standing near any link names the two people who
   made it and how long ago.
5. **Stand at the anchor.** The roll of most-connected visitors, and your own.
6. **Walk to the outer ring.** Four pillars flash a sequence; repeat it to earn a
   mark that rides on the next hand you leave.
7. **Leave a hand ✋** for whoever comes next.

---

## 5. Before submitting

```bash
npm run verify     # typecheck, 195 tests, production build, preflight
```

- [ ] NAME owned by the deploying wallet, and `scene.json` matches it exactly
- [ ] Deployed, and reachable via `/goto maincharacter.dcl.eth`
- [ ] Opened **cold** on a phone after 3+ minutes of nobody visiting
- [ ] A hand left, app closed 5 minutes, hand still there on return
- [ ] Two wallets, one link — appearing for both
- [ ] 30+ FPS on the test device
- [ ] Real scene thumbnail (not the SDK template image)
- [ ] `logsPermissions` set, so production server logs are readable

---

## 6. Honest status

What is verified, and what is not — worth being straight about internally even
where the submission copy is confident.

**Verified:** typecheck, 195 tests, production build, preflight, local
Multiplayer Server boot, and one real wallet authenticating from a phone over
LAN preview.

**Not verified:** the deploy, cold start, persistence across an empty world, two
wallets shaking hands, FPS on a device, and how any of it looks on a small
screen.

None of that is fixable from a keyboard. It is all one deploy away.
