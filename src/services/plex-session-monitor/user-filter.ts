import type { User } from '@root/types/config.types.js'

export type AllowedUserMatcher = (
  plexUserId: string,
  plexUsername: string,
  plexUserUuid?: string | null,
) => boolean

export const allowAllUsers: AllowedUserMatcher = () => true

/**
 * filterUsers holds Pulsarr user ids, but sessions carry Plex identity, so
 * configured ids resolve to user rows and match by plex.tv uuid, then name.
 * Raw matching covers legacy API-written values, minus values that resolved
 * to a user - a raw DB id would collide with small server-local session ids.
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
