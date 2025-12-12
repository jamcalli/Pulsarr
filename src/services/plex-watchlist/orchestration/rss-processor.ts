/**
 * RSS Processor Orchestration
 *
 * Functions for processing RSS watchlist feeds.
 * Extracted from PlexWatchlistService to support thin orchestrator pattern.
 */

import type { Config } from '@root/types/config.types.js'
import type {
  RssWatchlistResults,
  TemptRssWatchlistItem,
  WatchlistGroup,
} from '@root/types/plex.types.js'
import type { RssFeedsSuccess } from '@schemas/plex/generate-rss-feeds.schema.js'
import type { DatabaseService } from '@services/database.service.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { fetchWatchlistFromRss, getPlexWatchlistUrls } from '../index.js'
import { mapRssItemsToWatchlist } from '../rss/rss-mapper.js'

/**
 * Dependencies for RSS processor operations
 */
export interface RssProcessorDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
  config: Config
  fastify: FastifyInstance
}

/**
 * Generates and saves RSS feed URLs for the configured Plex tokens.
 *
 * @param deps - Dependencies for the operation
 * @returns RSS feed response with self and friends URLs
 * @throws Error if no Plex token is configured or URLs cannot be fetched
 */
export async function generateAndSaveRssFeeds(
  deps: RssProcessorDeps,
): Promise<RssFeedsSuccess> {
  const { db, logger, config, fastify } = deps
  const tokens = config.plexTokens

  if (tokens.length === 0) {
    throw new Error('No Plex token configured')
  }

  const tokenSet: Set<string> = new Set(tokens)
  const skipFriendSync = config.skipFriendSync || false

  const { selfRss, friendsRss } = await getPlexWatchlistUrls(
    tokenSet,
    skipFriendSync,
    logger,
  )

  if (!selfRss && !friendsRss) {
    throw new Error('Unable to fetch watchlist URLs')
  }

  const dbUrls = {
    selfRss: selfRss || '',
    friendsRss: friendsRss || '',
  }

  // Persist to database first
  await db.updateConfig(dbUrls)

  // Then update in-memory config
  try {
    await fastify.updateConfig(dbUrls)
    logger.debug(dbUrls, 'RSS feed URLs saved to database and memory')
  } catch (memUpdateErr) {
    logger.error(
      { error: memUpdateErr },
      'DB updated but failed to sync in-memory config - restart may be needed',
    )
    // In-memory config is stale but DB has correct value
    // Next server restart will load correct value from DB
  }

  return {
    self: dbUrls.selfRss,
    friends: dbUrls.friendsRss,
  }
}

/**
 * Ensures RSS feeds are configured, generating them if necessary.
 *
 * @param deps - Dependencies for the operation
 * @returns Object with selfRss and friendsRss URLs
 */
export async function ensureRssFeeds(
  deps: RssProcessorDeps,
): Promise<{ selfRss?: string; friendsRss?: string }> {
  const { db, logger, config } = deps

  if (!config?.selfRss && !config?.friendsRss) {
    logger.debug(
      'No RSS feeds found in configuration, attempting to generate...',
    )
    // generateAndSaveRssFeeds handles both DB persistence and in-memory config sync
    await generateAndSaveRssFeeds(deps)
    const updatedConfig = await db.getConfig()

    if (!updatedConfig?.selfRss && !updatedConfig?.friendsRss) {
      throw new Error('Unable to generate or retrieve RSS feed URLs')
    }

    return updatedConfig
  }

  return config
}

/**
 * Processes a single RSS watchlist feed.
 *
 * @param rssUrl - URL of the RSS feed
 * @param source - Source identifier ('self' or 'friends')
 * @param logger - Logger instance
 * @returns Watchlist group with total and users array
 */
async function processRssWatchlist(
  rssUrl: string,
  source: 'self' | 'friends',
  logger: FastifyBaseLogger,
): Promise<{ total: number; users: WatchlistGroup[] }> {
  const sourceLabel = source === 'self' ? 'selfRSS' : 'friendsRSS'
  const watchlistId = source
  const username = source === 'self' ? 'Self Watchlist' : 'Friends Watchlist'

  const items = await fetchWatchlistFromRss(rssUrl, sourceLabel, 1, logger)

  const watchlistGroup: WatchlistGroup = {
    user: {
      watchlistId,
      username,
      userId: 1,
    },
    watchlist: mapRssItemsToWatchlist(items as Set<TemptRssWatchlistItem>),
  }

  return {
    total: items.size,
    users: [watchlistGroup],
  }
}

/**
 * Processes both self and friends RSS watchlist feeds.
 *
 * @param deps - Dependencies for the operation
 * @returns Combined results from both RSS feeds
 */
export async function processRssWatchlists(
  deps: RssProcessorDeps,
): Promise<RssWatchlistResults> {
  const { logger } = deps
  const config = await ensureRssFeeds(deps)

  const results: RssWatchlistResults = {
    self: {
      total: 0,
      users: [],
    },
    friends: {
      total: 0,
      users: [],
    },
  }

  if (config.selfRss) {
    results.self = await processRssWatchlist(config.selfRss, 'self', logger)
  }

  if (config.friendsRss) {
    results.friends = await processRssWatchlist(
      config.friendsRss,
      'friends',
      logger,
    )
  }

  return results
}

/**
 * Process RSS watchlists with real user details for API responses.
 * This method is optimized for API endpoints that need actual user information.
 *
 * @param deps - Dependencies for the operation
 * @returns Combined results with real user details
 */
export async function processRssWatchlistsWithUserDetails(
  deps: RssProcessorDeps,
): Promise<RssWatchlistResults> {
  const { db } = deps
  const results = await processRssWatchlists(deps)

  // Lazy load primary user details only when needed for API response
  if (results.self.users.length > 0) {
    const primaryUser = await db.getPrimaryUser()
    if (primaryUser) {
      results.self.users[0].user = {
        watchlistId: primaryUser.name,
        username: primaryUser.name,
        userId: primaryUser.id,
      }
    }
  }

  return results
}
