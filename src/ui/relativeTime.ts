/**
 * Formats an age as a very short, mostly language-neutral string.
 *
 * Deliberately terse ("3d", "5h", "now") rather than prose: the audience is
 * international, AGENTS.md §6 says prefer icons and err toward the wordless, and
 * this has to stay readable on a five-inch screen.
 *
 * `createdAt` is the SERVER's clock and `now` is the client's. They are not the
 * same clock and can differ by seconds or, if a device's date is badly wrong, by
 * much more. That is tolerable at this granularity, but the result is clamped so
 * a skewed clock can never render something absurd like "-4h" or "19000d".
 */
export function shortAge(createdAt: number, now: number): string {
  if (!Number.isFinite(createdAt) || createdAt <= 0) return ''

  const ms = now - createdAt
  // Negative means the server clock is ahead of ours. Show "now" rather than
  // exposing the skew to the player.
  if (ms < 60_000) return 'now'

  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes}m`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`

  const days = Math.floor(hours / 24)
  // Anything beyond the hand TTL horizon is almost certainly clock skew, not a
  // genuinely ancient link. Cap it rather than print nonsense.
  if (days > 999) return ''
  return `${days}d`
}
