import { engine, Transform, MeshRenderer, MeshCollider, Material, Entity } from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { ECHOES, SCENE } from '../config'

const pillars: Entity[] = []
const positions: Vector3.MutableVector3[] = []
/** Last brightness written per pillar, so nothing is rewritten every tick. */
const litState: boolean[] = []

export function getPillars(): readonly Entity[] {
  return pillars
}

export function getPillarPosition(index: number): Vector3.ReadonlyVector3 | undefined {
  return positions[index]
}

/**
 * Builds the four echo pillars.
 *
 * Purely local and authored — created identically on every client from the same
 * constants, never synced. The puzzle is single-player, so there is no shared
 * state to replicate and no reason to spend network budget on it.
 */
export function createPillars(): void {
  if (pillars.length > 0) return

  for (let i = 0; i < ECHOES.PILLAR_COUNT; i++) {
    const angle = (i / ECHOES.PILLAR_COUNT) * 360
    const radians = (angle * Math.PI) / 180
    const position = Vector3.create(
      SCENE.CENTRE.x + Math.cos(radians) * ECHOES.RADIUS_M,
      ECHOES.HEIGHT_M / 2,
      SCENE.CENTRE.z + Math.sin(radians) * ECHOES.RADIUS_M
    )

    const entity = engine.addEntity()
    Transform.create(entity, {
      position,
      scale: Vector3.create(ECHOES.WIDTH_M, ECHOES.HEIGHT_M, ECHOES.WIDTH_M)
    })
    MeshRenderer.setBox(entity)
    MeshCollider.setBox(entity)

    pillars.push(entity)
    positions.push(position)
    litState.push(true) // forces the first paint below to actually write
    setPillarLit(i, false)
  }
}

/**
 * Sets a pillar's brightness. No-ops when already in that state — the puzzle
 * runs on the scene tick, and rewriting an unchanged material every tick is the
 * per-frame mutation AGENTS.md §7 warns about.
 */
export function setPillarLit(index: number, lit: boolean): void {
  const entity = pillars[index]
  if (entity === undefined) return
  if (litState[index] === lit) return
  litState[index] = lit

  const tint = ECHOES.TINTS[index % ECHOES.TINTS.length]
  Material.setPbrMaterial(entity, {
    albedoColor: Color4.create(tint.r, tint.g, tint.b, 1),
    emissiveColor: Color4.create(tint.r, tint.g, tint.b, 1),
    // Idle pillars must be findable. At 0.25 against a near-black ground they
    // were effectively invisible, so the puzzle existed but nobody would ever
    // walk to it. Bright enough to read as four coloured posts from across the
    // parcel, still well under the hands (1.8) and a lit pillar (3.2) so the
    // social layer keeps first claim on attention.
    emissiveIntensity: lit ? 3.2 : 0.9,
    roughness: 0.45
  })
}

export function setAllPillarsLit(lit: boolean): void {
  for (let i = 0; i < pillars.length; i++) setPillarLit(i, lit)
}
