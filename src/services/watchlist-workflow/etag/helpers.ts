/**
 * ETag Helpers Module
 *
 * Helper functions for ETag-based change detection.
 */

import type { EtagUserInfo } from '@root/types/plex.types.js'

/**
 * Build EtagUserInfo array from the userMap returned by checkFriendChanges.
 * Needs to include watchlistId for each friend.
 *
 * @param userMap - Map of watchlistId (UUID) to userId
 * @returns Array of EtagUserInfo for friends
 */
export function buildEtagUserInfoFromMap(
  userMap: Map<string, number>,
): EtagUserInfo[] {
  const friends: EtagUserInfo[] = []

  for (const [watchlistId, userId] of userMap) {
    friends.push({
      userId,
      username: '', // We don't have username here, but EtagPoller uses watchlistId
      watchlistId,
      isPrimary: false,
    })
  }

  return friends
}
