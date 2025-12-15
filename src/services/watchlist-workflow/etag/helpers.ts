/**
 * ETag Helpers Module
 *
 * Helper functions for ETag-based change detection.
 */

import type { EtagUserInfo, UserMapEntry } from '@root/types/plex.types.js'

/**
 * Build EtagUserInfo array from the userMap returned by checkFriendChanges.
 * Needs to include watchlistId for each friend.
 *
 * @param userMap - Map of watchlistId (UUID) to user info
 * @returns Array of EtagUserInfo for friends
 */
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
