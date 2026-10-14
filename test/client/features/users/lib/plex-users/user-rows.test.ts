import {
  notificationChannels,
  type PlexUser,
  type PlexUserRow,
  visibleRows,
} from '@/features/users/lib/plex-users/user-rows'
import { parseUsersState } from '@/features/users/lib/plex-users/users-state'
import { setFormatLocale } from '@/lib/format'

function plexUser(overrides: Partial<PlexUser> = {}): PlexUser {
  return {
    id: 1,
    name: 'maya',
    apprise: null,
    alias: null,
    discord_id: '331920077154',
    notify_apprise: false,
    notify_discord: false,
    notify_discord_mention: false,
    notify_plex_mobile: false,
    can_sync: true,
    requires_approval: false,
    is_primary_token: false,
    avatar: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    friendStatus: 'friend',
    pendingSince: null,
    watchlist_count: 0,
    ...overrides,
  }
}

describe('notificationChannels', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
  })

  afterEach(() => {
    setFormatLocale(undefined)
  })

  it('lists a Discord mention as its own channel', () => {
    expect(
      notificationChannels(
        plexUser({ notify_discord_mention: true, notify_plex_mobile: true }),
      ),
    ).toBe('Discord mention, Plex mobile')
  })

  it('is null when no channel is on', () => {
    expect(notificationChannels(plexUser())).toBeNull()
  })
})

function row(
  overrides: Partial<PlexUser>,
  quotas: PlexUserRow['quotas'] = { movie: null, show: null },
): PlexUserRow {
  return { user: plexUser(overrides), quotas }
}

function quota(currentUsage: number, quotaLimit: number) {
  return {
    quotaType: 'monthly' as const,
    quotaLimit,
    currentUsage,
    exceeded: currentUsage >= quotaLimit,
    resetDate: null,
    bypassApproval: false,
    watchlistCap: null,
    watchlistUsage: null,
    watchlistCapExceeded: false,
  }
}

function sortedNames(rows: PlexUserRow[], search: string) {
  return visibleRows(rows, parseUsersState(new URLSearchParams(search))).map(
    ({ user }) => user.name,
  )
}

describe('visibleRows sorting', () => {
  it('orders relationships from the owner down, unknown last', () => {
    const rows = [
      row({ name: 'pending', friendStatus: 'pending_sent' }),
      row({ name: 'unknown', friendStatus: null }),
      row({ name: 'noserver', friendStatus: 'friend_only' }),
      row({ name: 'owner', friendStatus: 'self' }),
      row({ name: 'friend', friendStatus: 'friend' }),
    ]

    expect(sortedNames(rows, 'sort=relationship')).toEqual([
      'owner',
      'friend',
      'noserver',
      'pending',
      'unknown',
    ])
  })

  it('puts sync and approval on first, then names', () => {
    const rows = [
      row({ name: 'b', can_sync: false, requires_approval: true }),
      row({ name: 'c', can_sync: true, requires_approval: false }),
      row({ name: 'a', can_sync: true, requires_approval: false }),
    ]

    expect(sortedNames(rows, 'sort=sync')).toEqual(['a', 'c', 'b'])
    expect(sortedNames(rows, 'sort=approval')).toEqual(['b', 'a', 'c'])
  })

  it('counts notification channels', () => {
    const rows = [
      row({ name: 'one', notify_discord: true }),
      row({ name: 'none' }),
      row({ name: 'two', notify_apprise: true, notify_plex_mobile: true }),
    ]

    expect(sortedNames(rows, 'sort=notifications&dir=desc')).toEqual([
      'two',
      'one',
      'none',
    ])
  })

  it('ranks quotas by the highest share used, users without quotas last', () => {
    const rows = [
      row({ name: 'none' }),
      row({ name: 'half' }, { movie: quota(5, 10), show: quota(1, 10) }),
      row({ name: 'full' }, { movie: null, show: quota(3, 3) }),
    ]

    expect(sortedNames(rows, 'sort=quotas&dir=desc')).toEqual([
      'full',
      'half',
      'none',
    ])
  })
})
