import { setFormatLocale } from '@/lib/format'
import {
  accountFacts,
  linkedToken,
  watchlistCounts,
} from '@/lib/plex/account-facts'
import type { components } from '@/types/api.js'

type UserWithCount = components['schemas']['UserWithCount']

function user(
  id: number,
  watchlistCount: number,
  primary = false,
): UserWithCount {
  return {
    id,
    name: `user-${id}`,
    apprise: null,
    alias: null,
    discord_id: null,
    notify_apprise: false,
    notify_discord: false,
    notify_discord_mention: false,
    notify_plex_mobile: false,
    can_sync: true,
    requires_approval: false,
    is_primary_token: primary,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    friendStatus: null,
    pendingSince: null,
    watchlist_count: watchlistCount,
  }
}

const users = [user(1, 214, true), user(2, 1000), user(3, 32)]

function feedConfig(selfRss: string, friendsRss: string) {
  return { plexTokens: ['token'], selfRss, friendsRss }
}

describe('account facts', () => {
  beforeEach(() => setFormatLocale('en-US'))
  afterEach(() => setFormatLocale(undefined))

  it('reads the linked token, null when none is saved', () => {
    expect(linkedToken({ plexTokens: ['abc'] })).toBe('abc')
    expect(linkedToken({ plexTokens: [] })).toBeNull()
  })

  it('splits the owner from friends and totals their items', () => {
    expect(watchlistCounts(users)).toEqual({
      owner: '214 items',
      friends: '2 friends, 1,032 items',
    })
  })

  it('reads an owner without a row as not synced', () => {
    expect(watchlistCounts([user(2, 5)]).owner).toBe('Not synced')
  })

  it('lists Plex Pass, both watchlists and the sync mode', () => {
    expect(
      accountFacts({
        config: feedConfig('https://rss/self', ''),
        users,
        hasPlexPass: true,
        friendsSynced: true,
        sync: { state: 'running', mode: 'rss', lastError: null },
      }).map((fact) => fact.value),
    ).toEqual(['Yes', '214 items', '2 friends, 1,032 items', 'RSS'])
  })

  it('marks friends not synced and polling without feeds', () => {
    expect(
      accountFacts({
        config: feedConfig('', ''),
        users,
        hasPlexPass: false,
        friendsSynced: false,
        sync: { state: null, mode: null, lastError: null },
      }).map((fact) => fact.value),
    ).toEqual(['No', '214 items', 'Not synced', 'Polling'])
  })

  it('reads the sync mode as off while the workflow is stopped', () => {
    const mode = accountFacts({
      config: feedConfig('https://rss/self', ''),
      users,
      hasPlexPass: true,
      friendsSynced: true,
      sync: { state: 'stopped', mode: null, lastError: null },
    }).at(-1)
    expect(mode).toEqual({ label: 'Sync mode', value: 'Off' })
  })

  it('prefers the mode the running workflow reports over the saved feeds', () => {
    const mode = accountFacts({
      config: feedConfig('https://rss/self', ''),
      users,
      hasPlexPass: true,
      friendsSynced: true,
      sync: { state: 'running', mode: 'polling', lastError: null },
    }).at(-1)
    expect(mode?.value).toBe('Polling')
  })
})
