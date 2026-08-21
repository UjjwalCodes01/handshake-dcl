import { engine, Transform, MeshRenderer, MeshCollider, Material, Entity } from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { COLORS, LATTICE, SCENE } from '../config'

/**
 * Builds the static scene.
 *
 * None of this is synced. It is created identically on every client from the
 * same constants, and nothing about it ever changes — AGENTS.md §5 is explicit
 * that static Transforms and MeshRenderers must never be sync targets. Syncing
 * them would spend network budget to replicate values both sides already know.
 */
let anchor: Entity | undefined
/** Last brightness step written, so the anchor is not rewritten every tick. */
let anchorStep = -1

export function createWorld(): void {
  createGround()
  anchor = createAnchor()
}

/**
 * The anchor doubles as the world's beacon: it brightens as the lattice fills.
 *
 * For a player arriving alone this is the only immediate signal that anything
 * has ever happened here. A dark pillar reads as an empty room; a lit one reads
 * as a place with a history worth walking around.
 *
 * Written in discrete steps rather than continuously, so this costs one material
 * write per threshold crossed instead of one per tick (AGENTS.md §7).
 */
export function updateBeacon(linkCount: number): void {
  if (anchor === undefined) return

  const step = linkCount === 0 ? 0 : linkCount < 5 ? 1 : linkCount < 15 ? 2 : linkCount < 40 ? 3 : 4
  if (step === anchorStep) return
  anchorStep = step

  const intensity = 0.35 + step * 0.9
  const tint = step === 0 ? COLORS.ANCHOR : COLORS.LINK
  Material.setPbrMaterial(anchor, {
    albedoColor: Color4.create(tint.r, tint.g, tint.b, 1),
    emissiveColor: Color4.create(tint.r, tint.g, tint.b, 1),
    emissiveIntensity: intensity,
    roughness: 0.5
  })
}

function createGround(): void {
  const ground = engine.addEntity()
  Transform.create(ground, {
    position: Vector3.create(SCENE.CENTRE.x, 0, SCENE.CENTRE.z),
    scale: Vector3.create(SCENE.GROUND_SIZE, 0.1, SCENE.GROUND_SIZE)
  })
  MeshRenderer.setBox(ground)
  MeshCollider.setBox(ground)
  Material.setPbrMaterial(ground, {
    albedoColor: Color4.create(COLORS.GROUND.r, COLORS.GROUND.g, COLORS.GROUND.b, 1),
    roughness: 0.9,
    metallic: 0
  })
}

/**
 * The central pillar the lattice grows around. It is the first thing a player
 * sees on spawn (spawnPoints in scene.json aim the camera at it), so it doubles
 * as the scene's silent statement of purpose.
 */
function createAnchor(): Entity {
  const pillar = engine.addEntity()
  Transform.create(pillar, {
    position: Vector3.create(SCENE.CENTRE.x, LATTICE.HEIGHT_M / 2, SCENE.CENTRE.z),
    scale: Vector3.create(0.35, LATTICE.HEIGHT_M, 0.35)
  })
  MeshRenderer.setBox(pillar)
  MeshCollider.setBox(pillar)
  Material.setPbrMaterial(pillar, {
    albedoColor: Color4.create(COLORS.ANCHOR.r, COLORS.ANCHOR.g, COLORS.ANCHOR.b, 1),
    emissiveColor: Color4.create(COLORS.ANCHOR.r, COLORS.ANCHOR.g, COLORS.ANCHOR.b, 1),
    emissiveIntensity: 0.35,
    roughness: 0.5
  })
  return pillar
}
