import { engine } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { assertSyncIdsValid } from './sync-ids'
import { createSlots } from './entities/slots'
import { createWorld } from './entities/world'
import { setupEchoes } from './systems/echoes'
import { tickSystem } from './systems/tick'
import { onHandshakeComplete } from './systems/handshake'
import { installSessionHandlers } from './net/session'
import { startServer } from './server'
import { flashSuccess, setupUi } from './ui/hud'

/**
 * Scene entry point.
 *
 * This same file runs on the player's device AND on the Multiplayer Server —
 * `isServer()` splits the two. Kept thin: it wires things together and owns no
 * logic of its own (AGENTS.md §8).
 */
export function main(): void {
  // Fails loudly at boot rather than producing the silent, near-untraceable sync
  // corruption described in AGENTS.md §12 #2.
  assertSyncIdsValid()

  // Slot entities must exist on EVERY peer, server included, with matching enum
  // ids — this is the case where a manual id is mandatory. Must happen before
  // either branch touches them.
  createSlots()

  if (isServer()) {
    startServer()
    return
  }

  // Client only past this point. None of the scenery is synced, so building it
  // on the server would spend memory inside a 256 MB isolate for no benefit.
  createWorld()
  setupEchoes()
  installSessionHandlers()
  engine.addSystem(tickSystem)

  onHandshakeComplete(() => {
    flashSuccess()
  })

  setupUi()
}
