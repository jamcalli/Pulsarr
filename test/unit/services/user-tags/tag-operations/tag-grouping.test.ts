import { groupTagsByItem } from '@services/user-tags/tag-operations/tag-grouping.js'
import { describe, expect, it } from 'vitest'

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
