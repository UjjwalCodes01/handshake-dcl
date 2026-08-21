/**
 * Pure address helpers.
 *
 * Deliberately free of SDK imports so this logic can be executed and tested
 * outside the QuickJS sandbox. Everything here is a silent-corruption risk if it
 * is wrong — a casing mismatch or an asymmetric pair key does not crash, it just
 * makes two clients quietly disagree about who is who — so it is the part most
 * worth having real tests for.
 */

/**
 * Wallet addresses arrive from different sources with different casing
 * (EIP-55 checksummed vs lowercase). Comparing them raw is an intermittent bug
 * generator: two clients disagree about identity and the handshake never
 * resolves. Every address in this scene passes through here.
 */
export function normalizeAddress(address: string | undefined | null): string {
  if (!address) return ''
  return address.trim().toLowerCase()
}

/**
 * Order-independent key for a pair of players.
 *
 * Must be symmetric: pairKey(a, b) === pairKey(b, a). Both participants compute
 * this independently, and if they ever disagreed the same handshake would be
 * recorded twice or blocked entirely.
 */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}
