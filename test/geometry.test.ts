import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ECHOES, HANDS, HANDSHAKE, LATTICE, SCENE } from '../src/config.ts'
import { anchorHeight } from '../src/placement.ts'
import { GUIDE } from '../src/config.ts'

const scene = JSON.parse(readFileSync(new URL('../scene.json', import.meta.url), 'utf8'))
import { HAND_SLOT_COUNT, LINK_SLOT_COUNT, assertSyncIdsValid, handSlotId, linkSlotId } from '../src/sync-ids.ts'

/** Half the parcel; anything further from centre falls outside scene bounds. */
const HALF = SCENE.GROUND_SIZE / 2

test('every ring fits inside the parcel', () => {
  // Entities placed outside scene bounds are rejected at deploy time — a failure
  // that only appears when publishing, long after it was introduced.
  const rings: Array<[string, number]> = [
    ['lattice', LATTICE.RADIUS_M],
    ['hands', HANDS.RADIUS_M],
    ['echo pillars', ECHOES.RADIUS_M]
  ]
  for (const [name, radius] of rings) {
    assert.ok(radius < HALF, `${name} ring radius ${radius} exceeds parcel half-width ${HALF}`)
  }
})

test('rings do not overlap each other', () => {
  // Overlapping rings would let a hand and a link occupy the same spot, making
  // the readout ambiguous and the tap target unpredictable.
  assert.ok(LATTICE.RADIUS_M < HANDS.RADIUS_M, 'lattice must sit inside the hand ring')
  assert.ok(HANDS.RADIUS_M < ECHOES.RADIUS_M, 'hands must sit inside the pillar ring')
})

test('hysteresis release distances exceed their trigger distances', () => {
  // If release <= trigger the hysteresis inverts and the UI strobes on and off
  // while a player stands at the boundary — which reads as a broken scene.
  assert.ok(HANDSHAKE.RANGE_RELEASE_M > HANDSHAKE.RANGE_M, 'player proximity')
  assert.ok(HANDS.REACH_RELEASE_M > HANDS.REACH_M, 'hand reach')
  assert.ok(LATTICE.READ_RELEASE_M > LATTICE.READ_RANGE_M, 'link reading')
})

test('the lattice is reachable from the ground', () => {
  // The player Transform sits at their feet while the lattice climbs above head
  // height, so the eye offset plus read range must span the structure.
  const highest = 0.4 + LATTICE.HEIGHT_M
  const reachableTop = LATTICE.READ_EYE_OFFSET_M + LATTICE.READ_RANGE_M
  assert.ok(reachableTop > highest * 0.5, 'most of the lattice is unreadable from the ground')
})

test('sync id guard passes for the shipped configuration', () => {
  assert.doesNotThrow(() => assertSyncIdsValid())
})

test('every synced id is unique and below the Smart Item floor', () => {
  // Creator Hub assigns Smart Item ids from 8001 upward. A collision does not
  // error — it silently syncs the wrong entity, which is close to untraceable.
  const seen = new Set<number>()
  const ids: number[] = []
  for (let i = 0; i < HAND_SLOT_COUNT; i++) ids.push(handSlotId(i))
  for (let i = 0; i < LINK_SLOT_COUNT; i++) ids.push(linkSlotId(i))

  for (const id of ids) {
    assert.ok(Number.isInteger(id) && id >= 0, `invalid id ${id}`)
    assert.ok(id < 8001, `id ${id} collides with the Smart Item range`)
    assert.ok(!seen.has(id), `duplicate id ${id}`)
    seen.add(id)
  }
  assert.equal(seen.size, HAND_SLOT_COUNT + LINK_SLOT_COUNT)
})

test('hand and link id ranges cannot grow into each other', () => {
  // A future bump to HAND_SLOT_COUNT must not silently run into the link range.
  const lastHand = handSlotId(HAND_SLOT_COUNT - 1)
  const firstLink = linkSlotId(0)
  assert.ok(lastHand < firstLink, `hand ids reach ${lastHand}, link ids start at ${firstLink}`)
})

test('echo puzzle has a colour for every pillar', () => {
  assert.ok(ECHOES.TINTS.length >= ECHOES.PILLAR_COUNT, 'a pillar would reuse another pillar colour')
})

test('echo sequences never ask for a pillar that does not exist', () => {
  for (const length of ECHOES.ROUND_LENGTHS) {
    assert.ok(length > 0, 'a round with no steps would complete instantly')
  }
})

// ---------- scalability: the world must stay legal when it succeeds ----------

test('the anchor never breaches the scene height limit, at any scale', () => {
  // Height cap for one parcel is log2(n+1)x20 = 20 m. Exceeding it is a soft
  // limit — a Creator Hub warning and a rendering cost, not a deploy failure —
  // but a scene that quietly outgrows its own parcel as it succeeds is exactly
  // the kind of thing nobody notices until it is popular.
  const LIMIT = Math.log2(scene.scene.parcels.length + 1) * 20
  for (const total of [0, 1, 10, 100, 1_000, 100_000, 10_000_000, Number.MAX_SAFE_INTEGER]) {
    const h = anchorHeight(total, LATTICE.HEIGHT_M, LATTICE.GROWTH_PER_DECADE_M, LATTICE.MAX_ANCHOR_HEIGHT_M)
    assert.ok(Number.isFinite(h), `height not finite for total=${total}`)
    assert.ok(h <= LATTICE.MAX_ANCHOR_HEIGHT_M, `height ${h} exceeded its own cap at total=${total}`)
    assert.ok(h < LIMIT, `height ${h} breaches the ${LIMIT} m parcel limit at total=${total}`)
  }
})

test('the anchor grows monotonically with history', () => {
  // A world with more handshakes must never look less established than one with
  // fewer — that is the entire signal this conveys to an arriving visitor.
  let previous = -Infinity
  for (const total of [0, 1, 5, 50, 500, 5_000, 50_000]) {
    const h = anchorHeight(total, LATTICE.HEIGHT_M, LATTICE.GROWTH_PER_DECADE_M, LATTICE.MAX_ANCHOR_HEIGHT_M)
    assert.ok(h >= previous, `height went backwards at total=${total}`)
    previous = h
  }
})

test('anchor growth is visible across the range that matters', () => {
  // A curve that is technically correct but visually flat conveys nothing.
  const at = (n: number) =>
    anchorHeight(n, LATTICE.HEIGHT_M, LATTICE.GROWTH_PER_DECADE_M, LATTICE.MAX_ANCHOR_HEIGHT_M)
  assert.ok(at(10) - at(0) > 1, 'a world with ten handshakes looks the same as an empty one')
  assert.ok(at(1000) - at(10) > 1, 'a busy world looks the same as a quiet one')
})

test('a nonsensical total falls back to the base height', () => {
  for (const bad of [NaN, -1, -Infinity]) {
    assert.equal(
      anchorHeight(bad, LATTICE.HEIGHT_M, LATTICE.GROWTH_PER_DECADE_M, LATTICE.MAX_ANCHOR_HEIGHT_M),
      LATTICE.HEIGHT_M
    )
  }
})

test('the guide marker floats clear of the hand it points at', () => {
  // Too low and it overlaps the hand it is meant to identify; too high and it
  // reads as pointing at nothing. Must clear a hand at HANDS.HEIGHT_M plus its
  // own half-size.
  const markerBase = HANDS.HEIGHT_M + GUIDE.HEIGHT_OFFSET_M - GUIDE.SIZE / 2
  const handTop = HANDS.HEIGHT_M + (HANDS.SIZE * HANDS.REACH_SCALE) / 2
  assert.ok(markerBase > handTop, `marker base ${markerBase} overlaps a reachable hand topping out at ${handTop}`)
})

test('the guide marker stays under the scene height limit', () => {
  const LIMIT = Math.log2(scene.scene.parcels.length + 1) * 20
  const top = HANDS.HEIGHT_M + GUIDE.HEIGHT_OFFSET_M + GUIDE.SIZE
  assert.ok(top < LIMIT, `guide marker reaches ${top} m against a ${LIMIT} m limit`)
})
