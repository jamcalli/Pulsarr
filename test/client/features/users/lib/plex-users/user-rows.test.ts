import {
  notificationChannels,
  type PlexUser,
} from '@/features/users/lib/plex-users/user-rows'
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
