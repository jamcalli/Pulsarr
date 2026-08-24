import type { User } from '@root/types/config.types.js'

export type AllowedUserMatcher = (
  plexUserId: string,
  plexUsername: string,
) => boolean

export const allowAllUsers: AllowedUserMatcher = () => true

/**
 * filterUsers stores Pulsarr user ids (what the UI multi-select saves), but
 * sessions only carry the viewer's Plex account id and display title, so the
 * configured ids must be resolved to user rows and matched by name. Raw value
 * matching is kept for configs written via the API with usernames or Plex
 * account ids.
 */
export function buildAllowedUserMatcher(
  filterUsers: string[] | undefined,
  resolvedUsers: User[],
): AllowedUserMatcher {
  if (!filterUsers || filterUsers.length === 0) return allowAllUsers

  const rawValues = new Set(filterUsers)
  const names = new Set<string>()
  for (const user of resolvedUsers) {
    names.add(user.name.toLowerCase())
    // Plex reports the display name as the session title when one is set
    if (user.display_name) names.add(user.display_name.toLowerCase())
  }

  return (plexUserId, plexUsername) =>
    rawValues.has(plexUserId) ||
    rawValues.has(plexUsername) ||
    names.has(plexUsername.toLowerCase())
}
