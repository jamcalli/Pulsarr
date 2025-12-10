/**
 * RSS Feed Cache Manager
 *
 * Maintains separate caches for self and friends RSS feeds with ETag-based
 * change detection and efficient diffing to identify new items.
 *
 * Design:
 * - Dual independent caches (self feed and friends feed)
 * - Each feed has its own ETag for change detection
 * - Diff logic identifies items new to each cache independently
 * - Max 50 items per cache (RSS feed limit)
 */

import type { RssWatchlistItem } from '@root/types/plex.types.js'
import { normalizeGenre, parseGenres } from '@utils/guid-handler.js'
import type { FastifyBaseLogger } from 'fastify'
import { fetchRawRssFeed, generateStableKey } from '../fetching/rss-fetcher.js'

/**
 * Cached RSS item with stable key for diffing
 */
export interface CachedRssItem {
  stableKey: string
  title: string
  type: 'movie' | 'show'
  guids: string[]
  thumb?: string
  genres: string[]
  /** Plex user UUID who added this item */
  author: string
}

/**
 * Individual feed cache state
 */
interface FeedCache {
  etag: string | null
  lastFetch: number
  items: Map<string, CachedRssItem>
}

/**
 * Result of diffing a feed against its cache
 */
export interface RssDiffResult {
  feed: 'self' | 'friends'
  /** Whether the feed content changed */
  changed: boolean
  /** New items not previously in this cache */
  newItems: CachedRssItem[]
  /** Total items in current feed */
  totalItems: number
  /** Auth error flag */
  authError?: boolean
  /** Not found flag */
  notFound?: boolean
}

/**
 * Configuration for RSS feed cache
 */
export interface RssFeedCacheConfig {
  selfUrl: string
  friendsUrl: string
  token: string
}

/**
 * RSS Feed Cache Manager
 *
 * Manages separate caches for self and friends RSS feeds.
 * Each feed is polled and diffed independently.
 */
export class RssFeedCacheManager {
  private selfCache: FeedCache = {
    etag: null,
    lastFetch: 0,
    items: new Map(),
  }

  private friendsCache: FeedCache = {
    etag: null,
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
    const result = await fetchRawRssFeed(url, token, this.log, undefined)

    if (!result.success || result.notModified) {
      this.log.warn(
        { feed: feedType, success: result.success },
        'Failed to prime RSS cache',
      )
      return
    }

    // Build cache without reporting items as new
    const { newCache } = this.diffAndUpdateCache(feedType, result.items, cache)

    cache.etag = result.etag
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
    this.selfCache = { etag: null, lastFetch: 0, items: new Map() }
    this.friendsCache = { etag: null, lastFetch: 0, items: new Map() }
    this.log.debug('RSS feed caches cleared')
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats(): {
    self: { itemCount: number; etag: string | null; lastFetch: number }
    friends: { itemCount: number; etag: string | null; lastFetch: number }
  } {
    return {
      self: {
        itemCount: this.selfCache.items.size,
        etag: this.selfCache.etag,
        lastFetch: this.selfCache.lastFetch,
      },
      friends: {
        itemCount: this.friendsCache.items.size,
        etag: this.friendsCache.etag,
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
    const result = await fetchRawRssFeed(
      url,
      token,
      this.log,
      cache.etag ?? undefined,
    )

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

    // No change (HTTP 304 Not Modified)
    if (result.notModified) {
      return {
        feed: feedType,
        changed: false,
        newItems: [],
        totalItems: cache.items.size,
      }
    }

    // Process items and diff against cache
    const { newItems, newCache } = this.diffAndUpdateCache(
      feedType,
      result.items,
      cache,
    )

    // Update cache state
    cache.etag = result.etag
    cache.lastFetch = Date.now()
    cache.items = newCache

    this.log.info(
      {
        feed: feedType,
        totalItems: newCache.size,
        newItems: newItems.length,
        etag: result.etag?.substring(0, 16),
      },
      'RSS feed processed',
    )

    return {
      feed: feedType,
      changed: true,
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
        thumb: item.thumbnail?.url,
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
