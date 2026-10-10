/**
 * Content Grouper Utility
 *
 * Groups watchlist items by unique content to avoid duplicate processing.
 */

import type { ContentWithUsers } from '@root/types/plex-label-sync.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { parseGuids } from '@utils/guid-handler.js'
import { type NamingSource, resolveTagName } from '@utils/tag-normalization.js'
import type { FastifyBaseLogger } from 'fastify'

/**
 * Groups watchlist items by their content, consolidating users who have watchlisted the same item
 *
 * @param watchlistItems - Array of watchlist items from the database
 * @param db - Database service to fetch user information
 * @param logger - Logger instance
 * @returns Array of unique content items with their associated users
 */
export async function groupWatchlistItemsByContent(
  watchlistItems: Array<{
    id: string | number
    user_id: number
    guids?: string[] | string
    title: string
    type?: string
    key: string | null
  }>,
  db: DatabaseService,
  logger: FastifyBaseLogger,
  namingSource: NamingSource = 'username',
): Promise<ContentWithUsers[]> {
  const result: ContentWithUsers[] = []
  const contentByGuids = new Map<string, ContentWithUsers>()
  const contentByPlexKey = new Map<string, ContentWithUsers>()

  // Get all unique user IDs to fetch usernames
  const userIds = [...new Set(watchlistItems.map((item) => item.user_id))]
  const users = await db.getUsersByIds(userIds)

  const userMap = new Map(
    users.map((user) => [
      user.id,
      resolveTagName(user, namingSource) || `user_${user.id}`,
    ]),
  )

  for (const item of watchlistItems) {
    // Skip items without GUIDs
    if (!item.guids) {
      logger.debug(
        {
          itemId: item.id,
          title: item.title,
        },
        'Skipping watchlist item without GUIDs',
      )
      continue
    }

    const parsedGuids = parseGuids(item.guids)
    if (parsedGuids.length === 0) {
      logger.debug(
        {
          itemId: item.id,
          title: item.title,
        },
        'Skipping watchlist item with empty GUIDs',
      )
      continue
    }

    const contentKey = `${item.type}-${JSON.stringify([...parsedGuids].sort())}`
    const plexKey = item.key ? `${item.type}-${item.key}` : null
    const username = userMap.get(item.user_id) || `user_${item.user_id}`

    const existingContentItem =
      (plexKey ? contentByPlexKey.get(plexKey) : undefined) ??
      contentByGuids.get(contentKey)
    let contentItem: ContentWithUsers

    if (!existingContentItem) {
      contentItem = {
        primaryGuid: contentKey, // Use content-type-aware key as primary identifier
        allGuids: parsedGuids,
        title: item.title,
        type:
          item.type === 'movie' || item.type === 'show' ? item.type : 'movie',
        plexKey: item.key,
        users: [],
      }
      result.push(contentItem)
    } else {
      // Merge GUIDs from additional items for the same content
      const newGuids = parsedGuids.filter(
        (guid) => !existingContentItem.allGuids.includes(guid),
      )
      existingContentItem.allGuids.push(...newGuids)

      // Use the first non-null Plex key we find
      if (!existingContentItem.plexKey && item.key) {
        existingContentItem.plexKey = item.key
      }

      contentItem = existingContentItem
    }

    if (!contentByGuids.has(contentKey)) {
      contentByGuids.set(contentKey, contentItem)
    }
    if (plexKey && !contentByPlexKey.has(plexKey)) {
      contentByPlexKey.set(plexKey, contentItem)
    }

    // Add user to this content
    contentItem.users.push({
      user_id: item.user_id,
      username,
      watchlist_id: Number(item.id),
    })
  }

  logger.info(
    {
      watchlistItemCount: watchlistItems.length,
      uniqueContentCount: result.length,
      sampleContent: result.slice(0, 3).map((content) => ({
        primaryGuid: content.primaryGuid,
        title: content.title,
        userCount: content.users.length,
        hasPlexKey: !!content.plexKey,
      })),
    },
    `Grouped ${watchlistItems.length} watchlist items into ${result.length} unique content items`,
  )

  return result
}
