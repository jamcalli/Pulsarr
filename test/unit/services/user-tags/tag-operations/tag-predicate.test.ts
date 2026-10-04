import {
  getUserTagLabel,
  isAppUserTag,
  isRemovedTag,
} from '@services/user-tags/tag-operations/tag-predicate.js'
import { describe, expect, it } from 'vitest'
import { createMockUser } from '../../../../mocks/user.js'

describe('tag-predicate', () => {
  describe('isAppUserTag', () => {
    it('matches labels under the prefix', () => {
      expect(isAppUserTag('pulsarr-user-john', 'pulsarr-user')).toBe(true)
      expect(isAppUserTag('pulsarr-user-id-4', 'pulsarr-user')).toBe(true)
    })

    it('ignores case on both sides', () => {
      expect(isAppUserTag('Pulsarr-User-John', 'PULSARR-user')).toBe(true)
    })

    it('matches a label equal to the bare prefix', () => {
      expect(isAppUserTag('pulsarr-user', 'pulsarr-user')).toBe(true)
    })

    it('rejects labels that only share leading characters', () => {
      expect(isAppUserTag('pulsarr-username', 'pulsarr-user')).toBe(false)
      expect(isAppUserTag('pulsarr-removed', 'pulsarr-user')).toBe(false)
      expect(isAppUserTag('other', 'pulsarr-user')).toBe(false)
    })
  })

  describe('isRemovedTag', () => {
    it('matches the removed label case-insensitively', () => {
      expect(isRemovedTag('Pulsarr-Removed', 'pulsarr-removed')).toBe(true)
      expect(isRemovedTag('pulsarr-user-john', 'pulsarr-removed')).toBe(false)
    })
  })

  describe('getUserTagLabel', () => {
    it('uses the normalized username by default', () => {
      const user = createMockUser(1, 'John Smith', { alias: 'Johnny' })

      expect(getUserTagLabel(user, 'pulsarr-user', 'username')).toBe(
        'pulsarr-user-john-smith',
      )
    })

    it('uses the alias when that is the naming source', () => {
      const user = createMockUser(1, 'John Smith', { alias: 'Johnny' })

      expect(getUserTagLabel(user, 'pulsarr-user', 'alias')).toBe(
        'pulsarr-user-johnny',
      )
    })

    it('falls back to the username when alias mode has no alias', () => {
      const user = createMockUser(1, 'John')

      expect(getUserTagLabel(user, 'pulsarr-user', 'alias')).toBe(
        'pulsarr-user-john',
      )
    })

    it('falls back to the user id when the name sanitizes to nothing', () => {
      const user = createMockUser(12, '@@@')

      expect(getUserTagLabel(user, 'pulsarr-user', 'username')).toBe(
        'pulsarr-user-id-12',
      )
    })
  })
})
