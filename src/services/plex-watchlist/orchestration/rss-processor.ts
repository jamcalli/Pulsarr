import type { Config } from '@root/types/config.types.js'
import type {
  RssWatchlistResults,
  TemptRssWatchlistItem,
  WatchlistGroup,
} from '@root/types/plex.types.js'
import type { RssFeedsSuccess } from '@schemas/plex/generate-rss-feeds.schema.js'
import type { DatabaseService } from '@services/database.service.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import {
  fetchWatchlistFromRss,
  getPlexWatchlistUrls,
} from '../fetching/rss-fetcher.js'
import { mapRssItemsToWatchlist } from '../rss/rss-mapper.js'

export interface RssProcessorDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
  config: Config
  fastify: FastifyInstance
}

/** Persists the URLs to config and the DB; throws when no Plex token is configured. */
export async function generateAndSaveRssFeeds(
  deps: RssProcessorDeps,
): Promise<RssFeedsSuccess> {
  const { logger, config, fastify } = deps
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

  await fastify.updateConfigAndPersist(dbUrls)
  logger.debug(dbUrls, 'RSS feed URLs saved to database and memory')

  return {
    self: dbUrls.selfRss,
    friends: dbUrls.friendsRss,
  }
}

/** Generates and saves the feed URLs when neither is configured; throws if none can be obtained. */
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

async function processRssWatchlist(
  rssUrl: string,
  source: 'self' | 'friends',
  logger: FastifyBaseLogger,
): Promise<{ total: number; users: WatchlistGroup[] }> {
  const watchlistId = source
  const username = source === 'self' ? 'Self Watchlist' : 'Friends Watchlist'

  const items = await fetchWatchlistFromRss(rssUrl, 1, logger)

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

export async function processRssWatchlistsWithUserDetails(
  deps: RssProcessorDeps,
): Promise<RssWatchlistResults> {
  const { db } = deps
  const results = await processRssWatchlists(deps)

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
