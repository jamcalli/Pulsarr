import type { RssResponse, RssWatchlistItem } from '@root/types/plex.types.js'
import { RssFeedCacheManager } from '@services/plex-watchlist/cache/rss-feed-cache.js'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'
import { server } from '../../../../setup/msw-setup.js'

const SELF_URL = 'https://rss.plex.tv/test-feed'
const FRIENDS_URL = 'https://rss.plex.tv/test-friends-feed'

function rssItem(title: string, guid: string): RssWatchlistItem {
  return {
    title,
    pubDate: '2024-01-01',
    link: `https://example.com/${guid}`,
    description: `${title} description`,
    category: 'movie',
    credits: [],
    thumbnail: { url: 'https://example.com/thumb.jpg' },
    guids: [guid],
    keywords: ['Action'],
  }
}

function rssBody(items: RssWatchlistItem[]): RssResponse {
  return {
    title: 'Watchlist',
    description: 'Test watchlist',
    links: { self: 'test' },
    items,
  }
}

interface FeedState {
  tag: string
  body: RssResponse
  seen: Array<string | null>
}

function serveFeed(url: string, state: FeedState) {
  return http.get(url, ({ request }) => {
    const ifNoneMatch = request.headers.get('if-none-match')
    state.seen.push(ifNoneMatch)
    if (ifNoneMatch === state.tag) {
      return new HttpResponse(null, {
        status: 304,
        headers: { ETag: state.tag },
      })
    }
    return HttpResponse.json(state.body, { headers: { ETag: state.tag } })
  })
}

describe('RssFeedCacheManager', () => {
  const mockLogger = createMockLogger()

  afterEach(() => {
    server.resetHandlers()
  })

  const baseItems = [
    rssItem('Movie One', 'tmdb://1'),
    rssItem('Movie Two', 'tmdb://2'),
  ]

  it('sends the primed ETag and reports no change on 304', async () => {
    const state: FeedState = {
      tag: '"etag-1"',
      body: rssBody(baseItems),
      seen: [],
    }
    server.use(serveFeed(SELF_URL, state))
    const manager = new RssFeedCacheManager(mockLogger)

    await manager.primeCaches(SELF_URL, undefined, 'token')
    const result = await manager.checkSelfFeed(SELF_URL, 'token')

    expect(state.seen).toEqual([null, '"etag-1"'])
    expect(result).toEqual({
      feed: 'self',
      changed: false,
      newItems: [],
      totalItems: 2,
    })
  })

  it('reports only the new item when the ETag changes, then sends the new ETag', async () => {
    const state: FeedState = {
      tag: '"etag-1"',
      body: rssBody(baseItems),
      seen: [],
    }
    server.use(serveFeed(SELF_URL, state))
    const manager = new RssFeedCacheManager(mockLogger)

    await manager.primeCaches(SELF_URL, undefined, 'token')

    state.tag = '"etag-2"'
    state.body = rssBody([...baseItems, rssItem('Movie Three', 'tmdb://3')])

    const changed = await manager.checkSelfFeed(SELF_URL, 'token')
    expect(changed.changed).toBe(true)
    expect(changed.newItems).toHaveLength(1)
    expect(changed.newItems[0]?.title).toBe('Movie Three')
    expect(changed.totalItems).toBe(3)

    const unchanged = await manager.checkSelfFeed(SELF_URL, 'token')
    expect(state.seen).toEqual([null, '"etag-1"', '"etag-2"'])
    expect(unchanged.changed).toBe(false)
    expect(unchanged.newItems).toEqual([])
    expect(unchanged.totalItems).toBe(3)
  })

  it('sends no If-None-Match after clearCaches', async () => {
    const state: FeedState = {
      tag: '"etag-1"',
      body: rssBody(baseItems),
      seen: [],
    }
    server.use(serveFeed(SELF_URL, state))
    const manager = new RssFeedCacheManager(mockLogger)

    await manager.primeCaches(SELF_URL, undefined, 'token')
    manager.clearCaches()
    await manager.checkSelfFeed(SELF_URL, 'token')

    expect(state.seen).toEqual([null, null])
  })

  it('keeps self and friends caches independent on a friends 304', async () => {
    const selfState: FeedState = {
      tag: '"self-1"',
      body: rssBody(baseItems),
      seen: [],
    }
    const friendsState: FeedState = {
      tag: '"friends-1"',
      body: rssBody([rssItem('Friend Movie', 'tmdb://9')]),
      seen: [],
    }
    server.use(
      serveFeed(SELF_URL, selfState),
      serveFeed(FRIENDS_URL, friendsState),
    )
    const manager = new RssFeedCacheManager(mockLogger)

    await manager.primeCaches(SELF_URL, FRIENDS_URL, 'token')
    const before = manager.getCacheStats()

    const result = await manager.checkFriendsFeed(FRIENDS_URL, 'token')
    const after = manager.getCacheStats()

    expect(friendsState.seen).toEqual([null, '"friends-1"'])
    expect(selfState.seen).toEqual([null])
    expect(result.changed).toBe(false)
    expect(result.totalItems).toBe(1)
    expect(after.self).toEqual(before.self)
    expect(after.friends.itemCount).toBe(1)
  })
})
