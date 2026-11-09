import type { CachedRssItem, RssDiffResult } from '@root/types/plex.types.js'
import type { WorkflowDeps } from '@services/watchlist-workflow/types.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorkflowDeps } from '../../../../mocks/watchlist-workflow-deps.js'

vi.mock('@services/watchlist-workflow/rss/self-processor.js', () => ({
  processRssSelfItems: vi.fn(async () => {}),
}))

vi.mock('@services/watchlist-workflow/rss/friends-processor.js', () => ({
  processRssFriendsItems: vi.fn(async () => {}),
}))

import {
  checkRssFeeds,
  scheduleRssCheck,
} from '@services/watchlist-workflow/rss/feed-poller.js'
import { processRssFriendsItems } from '@services/watchlist-workflow/rss/friends-processor.js'
import { processRssSelfItems } from '@services/watchlist-workflow/rss/self-processor.js'

const SELF_URL = 'https://rss.test/self'
const FRIENDS_URL = 'https://rss.test/friends'

function rssItem(stableKey: string): CachedRssItem {
  return {
    stableKey,
    title: stableKey,
    type: 'movie',
    guids: ['tmdb://1'],
    genres: ['Action'],
    author: 'plex-uuid',
  }
}

function createDeps() {
  const checkSelfFeed = vi.fn(
    async (): Promise<RssDiffResult> => ({
      feed: 'self',
      changed: true,
      newItems: [rssItem('self-item')],
      totalItems: 1,
    }),
  )
  const checkFriendsFeed = vi.fn(
    async (): Promise<RssDiffResult> => ({
      feed: 'friends',
      changed: true,
      newItems: [rssItem('friends-item')],
      totalItems: 1,
    }),
  )

  const deps = createWorkflowDeps({
    config: {
      plexTokens: ['token'],
      selfRss: SELF_URL,
      friendsRss: FRIENDS_URL,
    },
    state: { rssFeedCache: { checkSelfFeed, checkFriendsFeed } },
  })

  return { deps, checkSelfFeed, checkFriendsFeed }
}

describe('checkRssFeeds', () => {
  let deps: WorkflowDeps
  let checkSelfFeed: ReturnType<typeof createDeps>['checkSelfFeed']
  let checkFriendsFeed: ReturnType<typeof createDeps>['checkFriendsFeed']

  beforeEach(() => {
    const created = createDeps()
    deps = created.deps
    checkSelfFeed = created.checkSelfFeed
    checkFriendsFeed = created.checkFriendsFeed
  })

  it('processes the new items each feed reports', async () => {
    await checkRssFeeds(deps)

    expect(checkSelfFeed).toHaveBeenCalledWith(SELF_URL, 'token')
    expect(checkFriendsFeed).toHaveBeenCalledWith(FRIENDS_URL, 'token')
    expect(processRssSelfItems).toHaveBeenCalledWith(
      [rssItem('self-item')],
      deps,
    )
    expect(processRssFriendsItems).toHaveBeenCalledWith(
      [rssItem('friends-item')],
      deps,
    )
  })

  it('does not process fetched items when the run ends during the fetch', async () => {
    checkSelfFeed.mockImplementation(async () => {
      deps.state.endRun()
      return {
        feed: 'self',
        changed: true,
        newItems: [rssItem('self-item')],
        totalItems: 1,
      }
    })

    await checkRssFeeds(deps)

    expect(processRssSelfItems).not.toHaveBeenCalled()
    expect(checkFriendsFeed).not.toHaveBeenCalled()
    expect(processRssFriendsItems).not.toHaveBeenCalled()
  })

  it('stays cancelled when a new run opens during the fetch', async () => {
    checkSelfFeed.mockImplementation(async () => {
      deps.state.endRun()
      deps.state.beginRun()
      return {
        feed: 'self',
        changed: true,
        newItems: [rssItem('self-item')],
        totalItems: 1,
      }
    })

    await checkRssFeeds(deps)

    expect(processRssSelfItems).not.toHaveBeenCalled()
    expect(checkFriendsFeed).not.toHaveBeenCalled()
    expect(processRssFriendsItems).not.toHaveBeenCalled()
  })
})

describe('scheduleRssCheck', () => {
  const INTERVAL_MS = 1_000
  let deps: WorkflowDeps
  let checkSelfFeed: ReturnType<typeof createDeps>['checkSelfFeed']

  beforeEach(() => {
    vi.useFakeTimers()
    const created = createDeps()
    deps = created.deps
    checkSelfFeed = created.checkSelfFeed
  })

  afterEach(() => {
    if (deps.state.rssCheckInterval) clearTimeout(deps.state.rssCheckInterval)
    deps.state.rssCheckInterval = null
    vi.useRealTimers()
  })

  it('fires the first tick after exactly one interval', async () => {
    scheduleRssCheck(deps, INTERVAL_MS)

    await vi.advanceTimersByTimeAsync(INTERVAL_MS - 1)
    expect(checkSelfFeed).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(checkSelfFeed).toHaveBeenCalledTimes(1)
  })

  it('does not start a second tick while a slow tick is in flight', async () => {
    checkSelfFeed.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS * 3))
      return { feed: 'self', changed: false, newItems: [], totalItems: 0 }
    })
    scheduleRssCheck(deps, INTERVAL_MS)

    await vi.advanceTimersByTimeAsync(INTERVAL_MS)
    expect(checkSelfFeed).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3)
    expect(checkSelfFeed).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(INTERVAL_MS)
    expect(checkSelfFeed).toHaveBeenCalledTimes(2)
  })

  it('does not reschedule when the handle is cleared during a tick', async () => {
    checkSelfFeed.mockImplementation(async () => {
      deps.state.rssCheckInterval = null
      return { feed: 'self', changed: false, newItems: [], totalItems: 0 }
    })
    scheduleRssCheck(deps, INTERVAL_MS)

    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 5)

    expect(checkSelfFeed).toHaveBeenCalledTimes(1)
    expect(deps.state.rssCheckInterval).toBeNull()
  })
})
