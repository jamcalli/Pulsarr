import {
  BULK_QUOTA_DEFAULTS,
  BULK_SETTINGS_DEFAULTS,
  blankBulkQuotaField,
  bulkQuotaPayload,
  bulkSettingsChangeCount,
  bulkSettingsUpdates,
  bulkUserFailure,
} from '@/features/users/lib/plex-users/bulk-actions'
import type {
  PlexUser,
  PlexUserRow,
} from '@/features/users/lib/plex-users/user-rows'
import { setFormatLocale } from '@/lib/format'
import { QUOTA_FIELD_DEFAULTS } from '@/lib/quota-fields'

function row(id: number, name: string, alias: string | null): PlexUserRow {
  const user: PlexUser = {
    id,
    name,
    apprise: null,
    alias,
    discord_id: null,
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
  }
  return { user, quotas: { movie: null, show: null } }
}

describe('bulk settings', () => {
  it('sends nothing and counts nothing at the defaults', () => {
    expect(bulkSettingsUpdates(BULK_SETTINGS_DEFAULTS)).toEqual({})
    expect(bulkSettingsChangeCount(BULK_SETTINGS_DEFAULTS)).toBe(0)
  })

  it('sends only the switches set to On or Off', () => {
    const values = {
      ...BULK_SETTINGS_DEFAULTS,
      can_sync: 'off',
      notify_plex_mobile: 'on',
    } as const
    expect(bulkSettingsUpdates(values)).toEqual({
      can_sync: false,
      notify_plex_mobile: true,
    })
    expect(bulkSettingsChangeCount(values)).toBe(2)
  })

  it('turns a channel off when its destination is cleared', () => {
    const values = {
      ...BULK_SETTINGS_DEFAULTS,
      notify_discord: 'on',
      clearAlias: true,
      clearDiscordId: true,
      clearApprise: true,
    } as const
    expect(bulkSettingsUpdates(values)).toEqual({
      alias: null,
      discord_id: null,
      notify_discord: false,
      apprise: null,
      notify_apprise: false,
    })
    expect(bulkSettingsChangeCount(values)).toBe(4)
  })
})

describe('bulk quotas', () => {
  it('deletes both types when clearing', () => {
    expect(
      bulkQuotaPayload({ ...BULK_QUOTA_DEFAULTS, action: 'clear' }, [1, 2]),
    ).toEqual({ userIds: [1, 2], operation: 'delete' })
  })

  it('updates each type, and a switched off type deletes its quota', () => {
    const payload = bulkQuotaPayload(
      {
        ...BULK_QUOTA_DEFAULTS,
        show: { ...BULK_QUOTA_DEFAULTS.show, on: false },
      },
      [3],
    )
    expect(payload).toEqual({
      userIds: [3],
      operation: 'update',
      movieQuota: {
        enabled: true,
        quotaType: QUOTA_FIELD_DEFAULTS.quotaType,
        quotaLimit: QUOTA_FIELD_DEFAULTS.quotaLimit,
        bypassApproval: false,
        watchlistCap: null,
      },
      showQuota: { enabled: false },
    })
  })

  it('blocks a blank limit only when setting', () => {
    const blank = {
      ...BULK_QUOTA_DEFAULTS,
      movie: { ...BULK_QUOTA_DEFAULTS.movie, quotaLimit: undefined },
    }
    expect(blankBulkQuotaField(blank)).toBe('limit')
    expect(blankBulkQuotaField({ ...blank, action: 'clear' })).toBeNull()
    expect(blankBulkQuotaField(BULK_QUOTA_DEFAULTS)).toBeNull()
  })
})

describe('bulkUserFailure', () => {
  beforeEach(() => setFormatLocale('en-US'))
  afterEach(() => setFormatLocale(undefined))

  const selected = [row(1, 'maya', 'Maya R.'), row(2, 'jamie', null)]

  it('is null when every user was updated', () => {
    expect(bulkUserFailure([], selected)).toBeNull()
  })

  it('names the users that failed by display name', () => {
    expect(bulkUserFailure([1, 2], selected)).toEqual({
      message: '2 of 2 users were not updated.',
      detail: 'Maya R., jamie',
    })
  })

  it('leaves out the names when no failed id is selected', () => {
    expect(bulkUserFailure([9], selected)).toEqual({
      message: '1 of 2 users was not updated.',
      detail: null,
    })
  })
})
