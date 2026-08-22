import { engine, Entity } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { PendingHand, HandshakeLink, WorldStats } from '../components'
import { HAND_SLOT_COUNT, LINK_SLOT_COUNT, STATS_SLOT_ID, handSlotId, linkSlotId } from '../sync-ids'

let statsEntity: Entity | undefined
const handSlots: Entity[] = []
const linkSlots: Entity[] = []

export function getStatsEntity(): Entity | undefined {
  return statsEntity
}

export function getHandSlot(index: number): Entity | undefined {
  return handSlots[index]
}

export function getLinkSlot(index: number): Entity | undefined {
  return linkSlots[index]
}

export function getHandSlots(): readonly Entity[] {
  return handSlots
}

export function getLinkSlots(): readonly Entity[] {
  return linkSlots
}

/** The empty value every slot starts at, on both server and client. */
export const EMPTY_STATS = { totalHandshakes: 0, topNames: [] as string[], topCounts: [] as number[] }
export const EMPTY_HAND = { active: false, owner: '', ownerName: '', marked: false, seed: 0, createdAt: 0 }
export const EMPTY_LINK = { active: false, a: '', b: '', aName: '', bName: '', live: false, seed: 0, createdAt: 0 }

/** True when a value is the untouched default — used by the server's write guard. */
export function isEmptyStats(value: { totalHandshakes: number } | undefined): boolean {
  return !value || value.totalHandshakes === 0
}

export function isEmptyHand(value: { active: boolean; owner: string } | undefined): boolean {
  return !value || (value.active === false && value.owner === '')
}

export function isEmptyLink(value: { active: boolean; a: string; b: string } | undefined): boolean {
  return !value || (value.active === false && value.a === '' && value.b === '')
}

/**
 * Creates the fixed slot pools.
 *
 * Must run on EVERY peer — each client and the Multiplayer Server — with the
 * same ids in the same order, because scene code runs on both. Each slot gets an
 * explicit entityEnumId so every peer agrees slot N is the same entity. This is
 * precisely the case where a manual id is mandatory (see sync-ids.ts).
 *
 * Slots are allocated once and reused forever. Nothing is destroyed, so the
 * entity count is fixed for the scene's lifetime and cannot creep upward during
 * a long session — which is what protects the 30 FPS floor.
 *
 * Only the state components are synced. MeshRenderer, Material and Transform are
 * created locally by the render systems and never replicated; AGENTS.md §5 is
 * explicit that syncing them wastes budget on values both sides derive alike.
 */
export function createSlots(): void {
  if (statsEntity !== undefined) return // idempotent

  statsEntity = engine.addEntity()
  WorldStats.create(statsEntity, EMPTY_STATS)
  syncEntity(statsEntity, [WorldStats.componentId], STATS_SLOT_ID)

  for (let i = 0; i < HAND_SLOT_COUNT; i++) {
    const entity = engine.addEntity()
    PendingHand.create(entity, EMPTY_HAND)
    syncEntity(entity, [PendingHand.componentId], handSlotId(i))
    handSlots.push(entity)
  }

  for (let i = 0; i < LINK_SLOT_COUNT; i++) {
    const entity = engine.addEntity()
    HandshakeLink.create(entity, EMPTY_LINK)
    syncEntity(entity, [HandshakeLink.componentId], linkSlotId(i))
    linkSlots.push(entity)
  }
}
