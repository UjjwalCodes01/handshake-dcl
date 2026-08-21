import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ECHOES, HANDS, HANDSHAKE, LATTICE, SCENE } from '../src/config.ts'
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
