import type {
  CachedRssItem,
  RssDiffResult,
  RssWatchlistItem,
} from '@root/types/plex.types.js'
import { normalizeGenre, parseGenres } from '@utils/guid-handler.js'
import { normalizePosterPath } from '@utils/poster-url.js'
import type { FastifyBaseLogger } from 'fastify'
import { fetchRawRssFeed, generateStableKey } from '../fetching/rss-fetcher.js'

interface FeedCache {
  lastFetch: number
  items: Map<string, CachedRssItem>
  etag?: string
}

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

  async checkSelfFeed(url: string, token: string): Promise<RssDiffResult> {
    return this.checkFeed('self', url, token, this.selfCache)
  }

  async checkFriendsFeed(url: string, token: string): Promise<RssDiffResult> {
    return this.checkFeed('friends', url, token, this.friendsCache)
  }

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

    this.log.debug(
      {
        selfItems: this.selfCache.items.size,
        friendsItems: this.friendsCache.items.size,
      },
      'RSS feed caches primed',
    )
  }

  private async primeFeed(
    feedType: 'self' | 'friends',
    url: string,
    token: string,
    cache: FeedCache,
  ): Promise<void> {
    const result = await fetchRawRssFeed(url, token, this.log, cache.etag)

    if (!result.success) {
      this.log.warn(
        { feed: feedType, success: result.success },
        'Failed to prime RSS cache',
      )
      return
    }

    if (result.notModified) {
      cache.lastFetch = Date.now()
      this.log.debug(
        { feed: feedType },
        'RSS feed cache primed, feed unchanged',
      )
      return
    }

    const { newCache } = this.diffAndUpdateCache(feedType, result.items, cache)

    cache.lastFetch = Date.now()
    cache.items = newCache
    cache.etag = result.etag

    this.log.debug(
      { feed: feedType, itemCount: newCache.size },
      'RSS feed cache primed',
    )
  }

  clearCaches(): void {
    this.selfCache = { lastFetch: 0, items: new Map() }
    this.friendsCache = { lastFetch: 0, items: new Map() }
    this.log.debug('RSS feed caches cleared')
  }

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

  private async checkFeed(
    feedType: 'self' | 'friends',
    url: string,
    token: string,
    cache: FeedCache,
  ): Promise<RssDiffResult> {
    const result = await fetchRawRssFeed(url, token, this.log, cache.etag)

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

    if (result.notModified) {
      cache.lastFetch = Date.now()
      return {
        feed: feedType,
        changed: false,
        newItems: [],
        totalItems: cache.items.size,
      }
    }

    const { newItems, newCache } = this.diffAndUpdateCache(
      feedType,
      result.items,
      cache,
    )

    cache.lastFetch = Date.now()
    cache.items = newCache
    cache.etag = result.etag

    if (newItems.length > 0) {
      this.log.debug(
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
        // Title case keeps RSS genres consistent with the genres the API sources store
        genres: parseGenres(item.keywords).map(normalizeGenre).filter(Boolean),
        author: item.author ?? '',
      }

      newCache.set(stableKey, cachedItem)

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
