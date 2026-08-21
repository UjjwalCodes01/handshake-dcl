import { getPlayer } from '@dcl/sdk/players'
import { normalizeAddress } from './address'

// Re-exported so callers keep importing identity helpers from one place, while
// the pure logic stays in a module that can be tested outside the sandbox.
export { normalizeAddress, pairKey } from './address'

let cachedSelf = ''

/**
 * This client's own wallet address, lowercased.
 *
 * Returns '' until the player profile is available. Callers must treat '' as
 * "not ready yet" and retry — the scene starts before identity resolves, and
 * guests resolve later than wallet users.
 */
export function getSelfAddress(): string {
  if (cachedSelf) return cachedSelf
  const me = getPlayer()
  if (!me) return ''
  const address = normalizeAddress(me.userId)
  if (!address) return ''
  cachedSelf = address
  return cachedSelf
}
