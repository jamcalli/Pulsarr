import type { User } from '@root/types/config.types.js'

export type AllowedUserMatcher = (
  plexUserId: string,
  plexUsername: string,
  plexUserUuid?: string | null,
) => boolean

export const allowAllUsers: AllowedUserMatcher = () => true

/**
 * filterUsers stores Pulsarr user ids (what the UI multi-select saves), but
 * sessions only carry the viewer's Plex identity, so the configured ids must
 * be resolved to user rows and matched by plex.tv uuid (exact, rename-proof)
 * with username matching as the fallback. Raw value matching is kept for
 * configs written via the API with usernames or Plex account ids, except
 * values that resolved to a Pulsarr user - those mean that user, and raw
 * Plex-id matching would let an unrelated session whose small server-local
 * id collides with a DB id through.
 */
export function buildAllowedUserMatcher(
  filterUsers: string[] | undefined,
  resolvedUsers: User[],
): AllowedUserMatcher {
  if (!filterUsers || filterUsers.length === 0) return allowAllUsers

  const resolvedIds = new Set(resolvedUsers.map((user) => String(user.id)))
  const rawValues = new Set(
    filterUsers
      .filter((value) => !resolvedIds.has(value))
      .map((value) => value.toLowerCase()),
  )
  const names = new Set<string>()
  const uuids = new Set<string>()
  for (const user of resolvedUsers) {
    names.add(user.name.toLowerCase())
    // Plex reports the display name as the session title when one is set
    if (user.display_name) names.add(user.display_name.toLowerCase())
    if (user.plex_uuid) uuids.add(user.plex_uuid.toLowerCase())
  }

  return (plexUserId, plexUsername, plexUserUuid) =>
    (plexUserUuid != null && uuids.has(plexUserUuid.toLowerCase())) ||
    rawValues.has(plexUserId.toLowerCase()) ||
    rawValues.has(plexUsername.toLowerCase()) ||
    names.has(plexUsername.toLowerCase())
}
