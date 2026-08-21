import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ECHOES, HANDS, LATTICE, SCENE } from '../src/config.ts'

type SpawnPoint = {
  position: { x: number[]; y: number[]; z: number[] }
  cameraTarget?: { x: number; y: number; z: number }
}

const scene = JSON.parse(readFileSync(new URL('../scene.json', import.meta.url), 'utf8')) as {
  spawnPoints: SpawnPoint[]
  scene: { parcels: string[] }
}

const CX = SCENE.CENTRE.x
const CZ = SCENE.CENTRE.z
const SIZE = SCENE.GROUND_SIZE

/** Every corner and the midpoint of the spawn box — a player may land anywhere in it. */
function spawnSamples(sp: SpawnPoint): Array<[number, number]> {
  const { x, z } = sp.position
  const xs = [x[0], (x[0] + x[1]) / 2, x[1]]
  const zs = [z[0], (z[0] + z[1]) / 2, z[1]]
  return xs.flatMap((a) => zs.map((b) => [a, b] as [number, number]))
}

function pillarPositions(): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let i = 0; i < ECHOES.PILLAR_COUNT; i++) {
    const rad = ((i / ECHOES.PILLAR_COUNT) * 360 * Math.PI) / 180
    out.push([CX + Math.cos(rad) * ECHOES.RADIUS_M, CZ + Math.sin(rad) * ECHOES.RADIUS_M])
  }
  return out
}

test('scene defines a default spawn point', () => {
  assert.ok(scene.spawnPoints?.length, 'no spawnPoints in scene.json')
})

test('no spawn position falls outside the parcel', () => {
  for (const sp of scene.spawnPoints) {
    for (const [x, z] of spawnSamples(sp)) {
      assert.ok(x >= 0 && x <= SIZE, `spawn x ${x} outside 0..${SIZE}`)
      assert.ok(z >= 0 && z <= SIZE, `spawn z ${z} outside 0..${SIZE}`)
    }
  }
})

test('players never spawn inside the lattice ring', () => {
  // Spawning among the link bars reads as being stuck in the geometry.
  for (const sp of scene.spawnPoints) {
    for (const [x, z] of spawnSamples(sp)) {
      const d = Math.hypot(x - CX, z - CZ)
      assert.ok(d > LATTICE.RADIUS_M, `spawn ${x},${z} is ${d.toFixed(2)}m from centre, inside the lattice`)
    }
  }
})

test('the echo puzzle cannot auto-start on arrival', () => {
  // A spawn point once sat 1.9m from a pillar, inside its 2.6m trigger, so a
  // player met the memory game before the handshake. That inverts what the
  // scene is about, and it is invisible in code review — only geometry shows it.
  for (const sp of scene.spawnPoints) {
    for (const [x, z] of spawnSamples(sp)) {
      for (const [px, pz] of pillarPositions()) {
        const d = Math.hypot(x - px, z - pz)
        assert.ok(
          d > ECHOES.REACH_M,
          `spawn ${x},${z} is ${d.toFixed(2)}m from a pillar (trigger ${ECHOES.REACH_M}m)`
        )
      }
    }
  }
})

test('the spawn faces the centre of the scene', () => {
  // The lit anchor and the lattice are the statement of purpose; a player who
  // spawns facing outward sees an empty parcel edge instead.
  for (const sp of scene.spawnPoints) {
    assert.ok(sp.cameraTarget, 'spawn point has no cameraTarget')
    assert.equal(sp.cameraTarget!.x, CX)
    assert.equal(sp.cameraTarget!.z, CZ)
  }
})

test('the social layer is what a player meets first', () => {
  // The handshake must be discovered before the single-player puzzle.
  //
  // Compared honestly: hands occupy 24 slots around their ring, near enough to
  // continuous that radial distance is fair. Pillars sit at only four discrete
  // points, so the straight-line distance to the NEAREST ONE is what a player
  // actually has to walk. Comparing ring radii instead would call a pillar
  // "close" when the nearest is a quarter of the way around the scene.
  for (const sp of scene.spawnPoints) {
    for (const [x, z] of spawnSamples(sp)) {
      const fromCentre = Math.hypot(x - CX, z - CZ)
      const toHandRing = Math.abs(fromCentre - HANDS.RADIUS_M)
      const toNearestPillar = Math.min(
        ...pillarPositions().map(([px, pz]) => Math.hypot(x - px, z - pz))
      )
      assert.ok(
        toHandRing < toNearestPillar,
        `spawn ${x},${z}: nearest pillar ${toNearestPillar.toFixed(2)}m but hand ring ${toHandRing.toFixed(2)}m away`
      )
    }
  }
})
