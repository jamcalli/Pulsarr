/**
 * RSS Feed Cache Manager
 *
 * Maintains separate caches for self and friends RSS feeds with stable key
 * (GUID) diffing to identify new items.
 *
 * Design:
 * - Dual independent caches (self feed and friends feed)
 * - Change detection via GUID comparison (not HTTP ETags)
 * - Diff logic identifies items new to each cache independently
 * - Max 50 items per cache (RSS feed limit)
 *
 * Note: HTTP ETag optimization removed due to Plex S3 migration (Jan 2026).
 * S3 generates different ETags and 302 redirects break If-None-Match.
 */

import type {
  CachedRssItem,
  RssDiffResult,
  RssWatchlistItem,
} from '@root/types/plex.types.js'
import { normalizeGenre, parseGenres } from '@utils/guid-handler.js'
import { normalizePosterPath } from '@utils/poster-url.js'
import type { FastifyBaseLogger } from 'fastify'
import { fetchRawRssFeed, generateStableKey } from '../fetching/rss-fetcher.js'

/**
 * Individual feed cache state
 */
interface FeedCache {
  lastFetch: number
  items: Map<string, CachedRssItem>
}

/**
 * RSS Feed Cache Manager
 *
 * Manages separate caches for self and friends RSS feeds.
 * Each feed is polled and diffed independently.
 */
export class RssFeedCacheManager {
  private selfCache: FeedCache = {
    lastFetch: 0,
    items: new Map(),
  }

  private friendsCache: FeedCache = {
    lastFetch: 0,
    items: new Map(),
  }

  private readonly log: FastifyBaseLogger

  constructor(log: FastifyBaseLogger) {
    this.log = log
  }

  /**
   * Check self RSS feed for changes and return new items
   */
  async checkSelfFeed(url: string, token: string): Promise<RssDiffResult> {
    return this.checkFeed('self', url, token, this.selfCache)
  }

  /**
   * Check friends RSS feed for changes and return new items
   */
  async checkFriendsFeed(url: string, token: string): Promise<RssDiffResult> {
    return this.checkFeed('friends', url, token, this.friendsCache)
  }

  /**
   * Prime both RSS caches by fetching current feeds without reporting new items.
   * Call this during startup to establish baselines before starting the polling interval.
   *
   * @param selfUrl - Self RSS feed URL
   * @param friendsUrl - Friends RSS feed URL
   * @param token - Plex token for authentication
   */
  async primeCaches(
    selfUrl: string | undefined,
    friendsUrl: string | undefined,
    token: string,
  ): Promise<void> {
    this.log.debug('Priming RSS feed caches (establishing baseline)')

    const primePromises: Promise<void>[] = []

    if (selfUrl) {
      primePromises.push(this.primeFeed('self', selfUrl, token, this.selfCache))
    }

    if (friendsUrl) {
      primePromises.push(
        this.primeFeed('friends', friendsUrl, token, this.friendsCache),
      )
    }

    await Promise.all(primePromises)

    this.log.info(
      {
        selfItems: this.selfCache.items.size,
        friendsItems: this.friendsCache.items.size,
      },
      'RSS feed caches primed',
    )
  }

  /**
   * Prime a single feed cache without reporting new items
   */
  private async primeFeed(
    feedType: 'self' | 'friends',
    url: string,
    token: string,
    cache: FeedCache,
  ): Promise<void> {
    const result = await fetchRawRssFeed(url, token, this.log)

    if (!result.success) {
      this.log.warn(
        { feed: feedType, success: result.success },
        'Failed to prime RSS cache',
      )
      return
    }

    // Build cache without reporting items as new
    const { newCache } = this.diffAndUpdateCache(feedType, result.items, cache)

    cache.lastFetch = Date.now()
    cache.items = newCache

    this.log.debug(
      { feed: feedType, itemCount: newCache.size },
      'RSS feed cache primed',
    )
  }

  /**
   * Clear both caches (used on workflow stop)
   */
  clearCaches(): void {
    this.selfCache = { lastFetch: 0, items: new Map() }
    this.friendsCache = { lastFetch: 0, items: new Map() }
    this.log.debug('RSS feed caches cleared')
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats(): {
    self: { itemCount: number; lastFetch: number }
    friends: { itemCount: number; lastFetch: number }
  } {
    return {
      self: {
        itemCount: this.selfCache.items.size,
        lastFetch: this.selfCache.lastFetch,
      },
      friends: {
        itemCount: this.friendsCache.items.size,
        lastFetch: this.friendsCache.lastFetch,
      },
    }
  }

  /**
   * Check a specific feed for changes and diff against cache
   */
  private async checkFeed(
    feedType: 'self' | 'friends',
    url: string,
    token: string,
    cache: FeedCache,
  ): Promise<RssDiffResult> {
    const result = await fetchRawRssFeed(url, token, this.log)

    // Handle errors
    if (!result.success) {
      return {
        feed: feedType,
        changed: false,
        newItems: [],
        totalItems: cache.items.size,
        authError: result.authError,
        notFound: result.notFound,
      }
    }

    // Process items and diff against cache (stable key comparison)
    const { newItems, newCache } = this.diffAndUpdateCache(
      feedType,
      result.items,
      cache,
    )

    // Update cache state
    cache.lastFetch = Date.now()
    cache.items = newCache

    // Only log if there are changes or on debug level
    if (newItems.length > 0) {
      this.log.info(
        {
          feed: feedType,
          totalItems: newCache.size,
          newItems: newItems.length,
        },
        'RSS feed processed - new items detected',
      )
    } else {
      this.log.debug(
        { feed: feedType, totalItems: newCache.size },
        'RSS feed processed - no new items',
      )
    }

    return {
      feed: feedType,
      changed: newItems.length > 0,
      newItems,
      totalItems: newCache.size,
    }
  }

  /**
   * Diff fetched items against cache and return new items
   */
  private diffAndUpdateCache(
    feedType: 'self' | 'friends',
    items: RssWatchlistItem[],
    cache: FeedCache,
  ): { newItems: CachedRssItem[]; newCache: Map<string, CachedRssItem> } {
    const newItems: CachedRssItem[] = []
    const newCache = new Map<string, CachedRssItem>()

    for (const item of items) {
      const stableKey = generateStableKey(item.guids)
      const contentType = this.parseCategory(item.category)

      if (!contentType) {
        this.log.debug(
          { title: item.title, category: item.category },
          'Skipping item with unknown category',
        )
        continue
      }

      const cachedItem: CachedRssItem = {
        stableKey,
        title: item.title,
        type: contentType,
        guids: item.guids,
        thumb: normalizePosterPath(item.thumbnail?.url) ?? undefined,
        // Normalize genres to title case for database consistency with API sources
        genres: parseGenres(item.keywords).map(normalizeGenre).filter(Boolean),
        author: item.author ?? '',
      }

      // Add to new cache
      newCache.set(stableKey, cachedItem)

      // Check if this is a new item (not in previous cache)
      if (!cache.items.has(stableKey)) {
        this.log.debug(
          { feed: feedType, title: item.title, author: cachedItem.author },
          'New RSS item detected',
        )
        newItems.push(cachedItem)
      }
    }

    return { newItems, newCache }
  }

  /**
   * Parse RSS category to content type
   */
  private parseCategory(category: string): 'movie' | 'show' | null {
    const normalized = category.toLowerCase().trim()
    if (normalized === 'movie' || normalized === 'movies') {
      return 'movie'
    }
    if (
      normalized === 'show' ||
      normalized === 'shows' ||
      normalized === 'tv'
    ) {
      return 'show'
    }
    return null
  }
}
