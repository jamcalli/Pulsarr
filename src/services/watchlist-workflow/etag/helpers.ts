import type { EtagUserInfo, UserMapEntry } from '@root/types/plex.types.js'

export function buildEtagUserInfoFromMap(
  userMap: Map<string, UserMapEntry>,
): EtagUserInfo[] {
  const friends: EtagUserInfo[] = []

  for (const [watchlistId, { userId, username }] of userMap) {
    friends.push({
      userId,
      username,
      watchlistId,
      isPrimary: false,
    })
  }

  return friends
}
