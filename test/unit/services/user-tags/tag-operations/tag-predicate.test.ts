import {
  getUserTagLabel,
  groupTagsByItem,
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

describe('groupTagsByItem', () => {
  it('collects every tag an item carries into one update', () => {
    const updates = groupTagsByItem([
      { id: 1, itemIds: [10, 11] },
      { id: 2, itemIds: [11, 12] },
    ])

    expect(updates).toEqual([
      { itemId: 10, tagIds: [1] },
      { itemId: 11, tagIds: [1, 2] },
      { itemId: 12, tagIds: [2] },
    ])
  })

  it('returns nothing for no tags or tags without items', () => {
    expect(groupTagsByItem([])).toEqual([])
    expect(groupTagsByItem([{ id: 1, itemIds: [] }])).toEqual([])
  })

  it('handles a single tagged item', () => {
    expect(groupTagsByItem([{ id: 7, itemIds: [3] }])).toEqual([
      { itemId: 3, tagIds: [7] },
    ])
  })

  it('does not repeat a tag listed twice for the same item', () => {
    expect(groupTagsByItem([{ id: 7, itemIds: [3, 3] }])).toEqual([
      { itemId: 3, tagIds: [7] },
    ])
  })
})
