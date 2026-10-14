import {
  settingsUpdate,
  toSettingsValues,
} from '@/features/users/lib/user/user-settings-form'
import type { components } from '@/types/api.js'

type User = components['schemas']['UserWithFriendStatus']

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 2,
    name: 'mayar88',
    apprise: null,
    alias: 'Maya R.',
    discord_id: '331920077154',
    notify_apprise: false,
    notify_discord: true,
    notify_discord_mention: false,
    notify_plex_mobile: true,
    can_sync: true,
    requires_approval: false,
    is_primary_token: false,
    avatar: null,
    created_at: '2025-02-02T00:00:00Z',
    updated_at: '2026-10-09T00:00:00Z',
    friendStatus: 'friend',
    pendingSince: null,
    ...overrides,
  }
}

describe('toSettingsValues', () => {
  it('turns null destinations into blank fields', () => {
    expect(toSettingsValues(makeUser({ alias: null }))).toMatchObject({
      alias: '',
      apprise: '',
      discord_id: '331920077154',
    })
  })
})

describe('settingsUpdate', () => {
  const user = makeUser()
  const saved = toSettingsValues(user)

  it('is empty when nothing changed', () => {
    expect(settingsUpdate(saved, user)).toEqual({})
  })

  it('sends only the changed fields', () => {
    expect(
      settingsUpdate(
        { ...saved, can_sync: false, requires_approval: true },
        user,
      ),
    ).toEqual({ can_sync: false, requires_approval: true })
  })

  it('trims text and saves a blank alias as null', () => {
    expect(
      settingsUpdate({ ...saved, alias: '   ', apprise: ' mailto://a ' }, user),
    ).toEqual({ alias: null, apprise: 'mailto://a' })
  })

  it('switches a channel off when its address is cleared', () => {
    expect(
      settingsUpdate(
        { ...saved, discord_id: '', notify_discord_mention: true },
        user,
      ),
    ).toEqual({ discord_id: null, notify_discord: false })
  })
})
