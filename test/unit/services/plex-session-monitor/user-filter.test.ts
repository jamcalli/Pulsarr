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

  it('matches the session uuid against the resolved plex_uuid', () => {
    const matcher = buildAllowedUserMatcher(
      ['5'],
      [makeUser({ id: 5, name: 'alice', plex_uuid: 'AB12cd34ef56ab78' })],
    )
    expect(matcher('900001', 'alice', 'ab12cd34ef56ab78')).toBe(true)
  })

  it('matches by uuid even when the session title matches nothing', () => {
    const matcher = buildAllowedUserMatcher(
      ['5'],
      [makeUser({ id: 5, name: 'alice', plex_uuid: 'ab12cd34ef56ab78' })],
    )
    expect(matcher('900001', 'renamed-account', 'ab12cd34ef56ab78')).toBe(true)
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

  it('matches legacy raw username values case-insensitively', () => {
    const matcher = buildAllowedUserMatcher(['Alice'], [])
    expect(matcher('900001', 'alice')).toBe(true)
  })

  it('keeps matching legacy raw Plex account id values', () => {
    const matcher = buildAllowedUserMatcher(['900001'], [])
    expect(matcher('900001', 'alice')).toBe(true)
  })

  it('does not treat a resolved DB id as a raw Plex account id', () => {
    // Owner and managed-account sessions report small server-local ids that
    // can collide with configured DB ids
    const matcher = buildAllowedUserMatcher(
      ['5'],
      [makeUser({ id: 5, name: 'alice' })],
    )
    expect(matcher('5', 'someone-else')).toBe(false)
  })

  it('blocks users not covered by the filter', () => {
    const matcher = buildAllowedUserMatcher(
      ['5'],
      [makeUser({ id: 5, name: 'alice', plex_uuid: 'ab12cd34ef56ab78' })],
    )
    expect(matcher('900002', 'someone-else', 'ffffffffffffffff')).toBe(false)
  })
})
