import { getPlayer } from '@dcl/sdk/players'

/**
 * Wallet addresses arrive from different sources with different casing
 * (EIP-55 checksummed vs lowercase). Comparing them raw is a silent,
 * intermittent bug generator: two clients disagree about who is who and the
 * handshake never resolves. Every address in this scene passes through here.
 */
export function normalizeAddress(address: string | undefined | null): string {
  if (!address) return ''
  return address.trim().toLowerCase()
}

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

/** Order-independent key for a pair of players. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}
