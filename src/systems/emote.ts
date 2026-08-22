import { triggerEmote } from '~system/RestrictedActions'
import { EMOTE } from '../config'

/**
 * Plays an emote on the local player's avatar when a handshake completes.
 *
 * A counter ticking upward is information; an avatar that actually reacts is the
 * thing another person sees. For a scene whose whole subject is two strangers
 * acknowledging each other, the gesture carries more than the number does.
 *
 * Two constraints shape this:
 *
 *  - It is a RESTRICTED action. Without `ALLOW_TO_TRIGGER_AVATAR_EMOTE` in
 *    scene.json it fails silently, and the docs also require the player to be
 *    inside the scene bounds. Both are satisfied here, but the call is still
 *    treated as best-effort: a failure must never interrupt the handshake it is
 *    celebrating.
 *  - It is throttled. Completing several handshakes in quick succession would
 *    otherwise restart the animation repeatedly and the avatar would twitch.
 */

let lastPlayedAt = 0

export function playHandshakeEmote(now: number): void {
  if (now - lastPlayedAt < EMOTE.COOLDOWN_MS) return
  lastPlayedAt = now

  // Deliberately not awaited. The emote is decoration; the handshake already
  // happened, and a rejected promise here must not surface as an error.
  void triggerEmote({ predefinedEmote: EMOTE.ON_HANDSHAKE }).catch(() => {
    // Restricted actions can be refused by the client. Nothing to recover.
  })
}

/** Test seam. */
export function resetEmote(): void {
  lastPlayedAt = 0
}
