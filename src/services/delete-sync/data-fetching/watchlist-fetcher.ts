import type { DatabaseService } from '@services/database.service.js'
import { parseGuids } from '@utils/guid-handler.js'
import type { FastifyBaseLogger } from 'fastify'

/**
 * Dependencies for watchlist data fetching operations
 */
export interface WatchlistFetcherDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
}

/**
 * Fetches all watchlist items, optionally filtered by users with sync enabled
 */
export async function fetchWatchlistItems(
  respectUserSyncSetting: boolean,
  deps: WatchlistFetcherDeps,
): Promise<Array<{ title: string; guids?: string | string[] }>> {
  if (respectUserSyncSetting) {
    return fetchWatchlistItemsWithUserFilter(deps)
  }

  // Get all watchlist items regardless of user sync settings
  const [shows, movies] = await Promise.all([
    deps.db.getAllShowWatchlistItems(),
    deps.db.getAllMovieWatchlistItems(),
  ])

  const watchlistItems = [...shows, ...movies]
  deps.logger.info(
    `Found ${watchlistItems.length} watchlist items from all users`,
  )

  return watchlistItems
}

/**
 * Fetches watchlist items filtered by users with sync enabled
 */
async function fetchWatchlistItemsWithUserFilter(
  deps: WatchlistFetcherDeps,
): Promise<Array<{ title: string; guids?: string | string[] }>> {
  // Get all users to check their sync permissions
  const allUsers = await deps.db.getAllUsers()
  const syncEnabledUserIds = allUsers
    .filter((user) => user.can_sync !== false)
    .map((user) => user.id)

  deps.logger.info(
    `Found ${syncEnabledUserIds.length} users with sync enabled out of ${allUsers.length} total users`,
  )

  // Only get watchlist items from users with sync enabled
  const [shows, movies] = await Promise.all([
    deps.db.getAllShowWatchlistItems().then((items) =>
      items.filter((item) => {
        const userId =
          typeof item.user_id === 'object'
            ? (item.user_id as { id: number }).id
            : Number(item.user_id)
        return syncEnabledUserIds.includes(userId)
      }),
    ),
    deps.db.getAllMovieWatchlistItems().then((items) =>
      items.filter((item) => {
        const userId =
          typeof item.user_id === 'object'
            ? (item.user_id as { id: number }).id
            : Number(item.user_id)
        return syncEnabledUserIds.includes(userId)
      }),
    ),
  ])

  const watchlistItems = [...shows, ...movies]
  deps.logger.info(
    `Found ${watchlistItems.length} watchlist items from users with sync enabled`,
  )

  return watchlistItems
}

/**
 * Extracts GUIDs from watchlist items into a set for efficient lookup
 */
export function extractGuidsFromWatchlistItems(
  watchlistItems: Array<{ title: string; guids?: string | string[] }>,
  logger: FastifyBaseLogger,
): Set<string> {
  // Create a set of unique GUIDs for efficient lookup
  const guidSet = new Set<string>()

  // Process all items to extract GUIDs using the standardized GUID handler
  for (const item of watchlistItems) {
    // Use parseGuids utility for consistent GUID parsing and normalization
    // parseGuids handles all edge cases gracefully and never throws
    const parsedGuids = parseGuids(item.guids)

    // Add each parsed and normalized GUID to the set for efficient lookup
    for (const guid of parsedGuids) {
      guidSet.add(guid)
    }
  }

  logger.debug(`Extracted ${guidSet.size} unique GUIDs from watchlist items`)

  // Trace sample of collected identifiers (limited to 5)
  if (logger.level === 'trace') {
    const sampleGuids = Array.from(guidSet).slice(0, 5)
    logger.trace({ sampleGuids }, 'Sample of watchlist GUIDs (first 5)')
  }

  return guidSet
}
