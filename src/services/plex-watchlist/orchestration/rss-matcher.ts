/**
 * RSS Matcher Orchestration
 *
 * Functions for matching RSS pending items to watchlist items and sending notifications.
 * Extracted from PlexWatchlistService to support thin orchestrator pattern.
 */

import type { Friend, TokenWatchlistItem } from '@root/types/plex.types.js'
import type { DatabaseService } from '@services/database.service.js'
import {
  getGuidMatchScore,
  hasMatchingParsedGuids,
  parseGuids,
} from '@utils/guid-handler.js'
import type { FastifyBaseLogger } from 'fastify'
import type { NotificationDeps } from '../notifications/notification-sender.js'
import { sendWatchlistNotifications } from '../notifications/notification-sender.js'
import { clearUserCanSyncCache, getUserCanSync } from '../users/index.js'

/**
 * Dependencies for RSS matcher operations
 */
export interface RssMatcherDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
  notificationDeps: NotificationDeps
}

/**
 * Gets parsed GUIDs with caching to avoid repeated parsing
 *
 * @param guidCache - Cache Map to store parsed results
 * @param source - Source GUIDs to parse
 * @returns Array of parsed GUIDs
 */
function getParsedGuids(
  guidCache: Map<string, string[]>,
  source: string | string[],
): string[] {
  // Handle undefined or null case
  if (!source) {
    return []
  }

  // Create a cache key
  const cacheKey = typeof source === 'string' ? source : JSON.stringify(source)

  // Return from cache if available
  if (guidCache.has(cacheKey)) {
    const cachedValue = guidCache.get(cacheKey)
    if (cachedValue) {
      return cachedValue
    }
  }

  // Parse and cache if not available
  const parsed = parseGuids(source)
  guidCache.set(cacheKey, parsed)
  return parsed
}

/**
 * Prepares notification and GUID caches for RSS item matching
 *
 * @param userWatchlistMap - Map of users to their watchlist items
 * @param deps - Dependencies for database access
 * @returns Object containing the prepared caches
 */
async function prepareRssMatchingCaches(
  userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>,
  deps: Pick<RssMatcherDeps, 'db'>,
): Promise<{
  guidCache: Map<string, string[]>
  notificationChecks: Map<number, Map<string, boolean>>
}> {
  const { db } = deps

  // Cache for parsed GUIDs
  const guidCache = new Map<string, string[]>()

  // Cache for notification checks
  const notificationChecks = new Map<number, Map<string, boolean>>()

  // Pre-process items to build title cache for each user
  const userItemTitles = new Map<number, string[]>()

  for (const [user, items] of userWatchlistMap.entries()) {
    const titles: string[] = []
    for (const item of items) {
      if (item.title) {
        titles.push(item.title)
      }
    }
    userItemTitles.set(user.userId, titles)
  }

  // Prefetch all notification checks at once
  await Promise.all(
    Array.from(userItemTitles.entries()).map(async ([userId, titles]) => {
      if (titles.length > 0) {
        const checks = await db.checkExistingWebhooks(userId, titles)
        notificationChecks.set(userId, checks)
      }
    }),
  )

  return { guidCache, notificationChecks }
}

/**
 * Process pending RSS items for matching and notification
 *
 * @param userWatchlistMap - Map of users to their watchlist items
 * @param source - Source of RSS items ('self' or 'friends')
 * @param deps - Dependencies for the operation
 * @returns Promise resolving when processing is complete
 */
export async function processRssPendingItems(
  userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>,
  source: 'self' | 'friends',
  deps: RssMatcherDeps,
): Promise<void> {
  const { db, logger, notificationDeps } = deps

  // Clear user sync cache for fresh permissions per operation
  clearUserCanSyncCache()

  // Prefetch can_sync for users to avoid repeated lookups during RSS matching
  const enabledUserIds = new Set<number>()
  await Promise.all(
    Array.from(userWatchlistMap.keys()).map(async (user) => {
      if (!user?.userId) return
      const canSync = await getUserCanSync(user.userId, { db, logger })
      if (canSync) enabledUserIds.add(user.userId)
    }),
  )

  if (enabledUserIds.size === 0) {
    logger.debug(
      `All users in RSS ${source} batch have sync disabled; skipping RSS processing`,
    )
    return
  }

  const pendingItems = await db.getTempRssItems(source)
  logger.debug(
    `Found ${pendingItems.length} pending RSS items to match during ${source} sync`,
  )

  if (pendingItems.length === 0) {
    return
  }

  // Tracking statistics
  let matchCount = 0
  let noMatchCount = 0
  let duplicateCount = 0
  const matchedItemIds: number[] = []
  const duplicateItemIds: number[] = []

  // Prepare caches for efficient matching
  const { guidCache, notificationChecks } = await prepareRssMatchingCaches(
    userWatchlistMap,
    { db },
  )

  // Process each pending item
  for (const pendingItem of pendingItems) {
    const pendingGuids = getParsedGuids(guidCache, pendingItem.guids)

    // Collect all potential matches with their scores
    const potentialMatches: Array<{
      user: Friend
      item: TokenWatchlistItem
      score: number
      matchingGuids: string[]
    }> = []

    for (const [user, items] of userWatchlistMap.entries()) {
      for (const item of items) {
        const itemGuids = getParsedGuids(guidCache, item.guids || [])
        const score = getGuidMatchScore(pendingGuids, itemGuids)

        // Only consider items that pass the threshold check
        if (hasMatchingParsedGuids(pendingGuids, itemGuids)) {
          potentialMatches.push({
            user,
            item,
            score,
            matchingGuids: pendingGuids.filter((g) => itemGuids.includes(g)),
          })
        }
      }
    }

    // Find the best match (highest score)
    if (potentialMatches.length > 0) {
      // Sort by score descending (highest first)
      potentialMatches.sort((a, b) => b.score - a.score)
      const bestMatch = potentialMatches[0]

      matchCount++
      matchedItemIds.push(pendingItem.id)

      logger.debug(
        { userId: bestMatch.user.userId, matchScore: bestMatch.score },
        `Matched item "${pendingItem.title}" to user ${bestMatch.user.username}'s item "${bestMatch.item.title}" (score: ${bestMatch.score})`,
      )

      // Check if notification should be sent
      let shouldSendNotification = true

      // Check if item was actually routed (route-only notifications)
      if (!pendingItem.routed) {
        logger.debug(
          { itemTitle: bestMatch.item.title, userId: bestMatch.user.userId },
          `Skipping notification for "${bestMatch.item.title}" - content was not routed to Radarr/Sonarr`,
        )
        shouldSendNotification = false
      }

      // Check if already notified (using prefetched data)
      if (shouldSendNotification) {
        const userNotifications = notificationChecks.get(bestMatch.user.userId)
        if (userNotifications?.get(bestMatch.item.title)) {
          logger.debug(
            `Skipping notification for "${bestMatch.item.title}" - already sent previously to user ID ${bestMatch.user.userId}`,
          )
          shouldSendNotification = false
        }
      }

      // Send notification if needed and user has sync enabled
      if (shouldSendNotification && enabledUserIds.has(bestMatch.user.userId)) {
        await sendWatchlistNotifications(
          bestMatch.user,
          {
            id: bestMatch.item.id,
            title: bestMatch.item.title,
            type: bestMatch.item.type || 'unknown',
            thumb: bestMatch.item.thumb,
          },
          notificationDeps,
        )

        // Update in-memory cache to prevent duplicate notifications in same batch
        let userNotifications = notificationChecks.get(bestMatch.user.userId)
        if (!userNotifications) {
          userNotifications = new Map()
          notificationChecks.set(bestMatch.user.userId, userNotifications)
        }
        userNotifications.set(bestMatch.item.title, true)
      } else if (
        shouldSendNotification &&
        !enabledUserIds.has(bestMatch.user.userId)
      ) {
        logger.debug(
          { userId: bestMatch.user.userId, itemTitle: bestMatch.item.title },
          `Skipping RSS notification for "${bestMatch.item.title}" - user ${bestMatch.user.username} (ID: ${bestMatch.user.userId}) has sync disabled`,
        )
      }
    }

    // Handle non-matching items
    if (potentialMatches.length === 0) {
      noMatchCount++

      let existsInDatabase = false

      // Check if item already exists in database
      for (const guid of pendingGuids) {
        const normalizedGuid = guid.toLowerCase()
        try {
          const existingItems = await db.getWatchlistItemsByGuid(normalizedGuid)

          if (existingItems && existingItems.length > 0) {
            existsInDatabase = true
            logger.debug(
              {
                itemTitle: pendingItem.title,
                guid,
                matchCount: existingItems.length,
              },
              `RSS item "${pendingItem.title}" already exists in watchlist database with GUID ${guid}`,
            )
            break
          }
        } catch (error) {
          logger.error({ error }, `Error checking database for GUID ${guid}:`)
        }
      }

      if (existsInDatabase) {
        duplicateCount++
        duplicateItemIds.push(pendingItem.id)
      } else {
        logger.warn(
          { itemTitle: pendingItem.title },
          `No match found for ${source} RSS item "${pendingItem.title}" (possibly recently removed from watchlist)`,
        )
        matchedItemIds.push(pendingItem.id)
      }
    }
  }

  // Clean up processed items
  const allIdsToDelete = [...matchedItemIds, ...duplicateItemIds]
  if (allIdsToDelete.length > 0) {
    await db.deleteTempRssItems(allIdsToDelete)
  }

  logger.debug(
    {
      totalChecked: pendingItems.length,
      matched: matchCount,
      unmatched: noMatchCount,
      duplicatesCleanedUp: duplicateCount,
      remainingUnmatched: noMatchCount - duplicateCount,
    },
    `${source} RSS matching complete`,
  )
}

/**
 * Match RSS pending items for the self watchlist
 *
 * @param userWatchlistMap - Map of users to their watchlist items
 * @param deps - Dependencies for the operation
 */
export async function matchRssPendingItemsSelf(
  userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>,
  deps: RssMatcherDeps,
): Promise<void> {
  return processRssPendingItems(userWatchlistMap, 'self', deps)
}

/**
 * Match RSS pending items for the friends watchlist
 *
 * @param userWatchlistMap - Map of users to their watchlist items
 * @param deps - Dependencies for the operation
 */
export async function matchRssPendingItemsFriends(
  userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>,
  deps: RssMatcherDeps,
): Promise<void> {
  return processRssPendingItems(userWatchlistMap, 'friends', deps)
}
