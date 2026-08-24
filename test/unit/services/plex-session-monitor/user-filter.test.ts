import type { User } from '@root/types/config.types.js'
import {
  allowAllUsers,
  buildAllowedUserMatcher,
} from '@services/plex-session-monitor/user-filter.js'
import { describe, expect, it } from 'vitest'

function makeUser(overrides: Partial<User> & Pick<User, 'id' | 'name'>): User {
  return {
    apprise: null,
    alias: null,
    discord_id: null,
    notify_apprise: false,
    notify_discord: false,
    notify_discord_mention: true,
    notify_plex_mobile: false,
    can_sync: true,
    requires_approval: false,
    is_primary_token: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('buildAllowedUserMatcher', () => {
  it('allows everyone when the filter is empty or missing', () => {
    expect(buildAllowedUserMatcher(undefined, [])).toBe(allowAllUsers)
    expect(buildAllowedUserMatcher([], [])).toBe(allowAllUsers)
    expect(allowAllUsers('900001', 'alice')).toBe(true)
  })

  it('matches a session username against the resolved user name', () => {
    const matcher = buildAllowedUserMatcher(
      ['5'],
      [makeUser({ id: 5, name: 'alice' })],
    )
    expect(matcher('900001', 'alice')).toBe(true)
  })

  it('matches names case-insensitively', () => {
    const matcher = buildAllowedUserMatcher(
      ['5'],
      [makeUser({ id: 5, name: 'Alice' })],
    )
    expect(matcher('900001', 'alice')).toBe(true)
  })

  it('matches the resolved display name', () => {
    const matcher = buildAllowedUserMatcher(
      ['5'],
      [makeUser({ id: 5, name: 'alice_account', display_name: 'Alice' })],
    )
    expect(matcher('900001', 'Alice')).toBe(true)
  })

  it('keeps matching legacy raw username values', () => {
    const matcher = buildAllowedUserMatcher(['alice'], [])
    expect(matcher('900001', 'alice')).toBe(true)
  })

  it('keeps matching legacy raw Plex account id values', () => {
    const matcher = buildAllowedUserMatcher(['900001'], [])
    expect(matcher('900001', 'alice')).toBe(true)
  })

  it('blocks users not covered by the filter', () => {
    const matcher = buildAllowedUserMatcher(
      ['5'],
      [makeUser({ id: 5, name: 'alice' })],
    )
    expect(matcher('900002', 'someone-else')).toBe(false)
  })
})
