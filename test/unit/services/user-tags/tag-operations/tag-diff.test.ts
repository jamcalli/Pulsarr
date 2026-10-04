import { computeTagDiffs } from '@services/user-tags/tag-operations/tag-diff.js'
import { describe, expect, it } from 'vitest'

const ALICE = 1
const BOB = 2
const REMOVED = 9
const OLD_REMOVED = 10
const UNRELATED = 50

const tagIdMap = new Map<number, string>([
  [ALICE, 'pulsarr-user-alice'],
  [BOB, 'pulsarr-user-bob'],
  [REMOVED, 'pulsarr-removed'],
  [OLD_REMOVED, 'pulsarr-removed-legacy'],
  [UNRELATED, '4k'],
])

const base = {
  tagIdMap,
  tagPrefix: 'pulsarr-user',
  removedTagPrefix: 'pulsarr-removed',
}

describe('computeTagDiffs', () => {
  it('adds missing users and drops stale users and removal tags in remove mode', () => {
    const diff = computeTagDiffs({
      ...base,
      mode: 'remove',
      existingTags: [ALICE, REMOVED, UNRELATED],
      userTagIds: [BOB],
    })
    expect(diff.toAdd).toEqual([BOB])
    expect(diff.toRemove).toEqual([ALICE, REMOVED])
    expect(diff.addRemovedTag).toBe(false)
  })

  it('never touches tags that are not ours', () => {
    const diff = computeTagDiffs({
      ...base,
      mode: 'remove',
      existingTags: [UNRELATED, ALICE],
      userTagIds: [ALICE],
    })
    expect(diff).toEqual({ toAdd: [], toRemove: [], addRemovedTag: false })
  })

  it('keeps stale user tags in keep mode and clears removal tags once someone wants it again', () => {
    const stale = computeTagDiffs({
      ...base,
      mode: 'keep',
      existingTags: [ALICE, REMOVED],
      userTagIds: [],
    })
    expect(stale).toEqual({ toAdd: [], toRemove: [], addRemovedTag: false })

    const readded = computeTagDiffs({
      ...base,
      mode: 'keep',
      existingTags: [ALICE, REMOVED],
      userTagIds: [BOB],
    })
    expect(readded.toAdd).toEqual([BOB])
    expect(readded.toRemove).toEqual([REMOVED])
  })

  it('swaps the last user tag for the removed tag in special-tag mode', () => {
    const diff = computeTagDiffs({
      ...base,
      mode: 'special-tag',
      existingTags: [ALICE, OLD_REMOVED],
      userTagIds: [],
    })
    expect(diff.toRemove).toEqual([ALICE, OLD_REMOVED])
    expect(diff.addRemovedTag).toBe(true)
  })

  it('does not re-add the removed tag when the item already carries it', () => {
    const diff = computeTagDiffs({
      ...base,
      mode: 'special-tag',
      existingTags: [ALICE, REMOVED],
      userTagIds: [],
    })
    expect(diff.toRemove).toEqual([ALICE])
    expect(diff.addRemovedTag).toBe(false)
  })

  it('leaves an already marked item alone in special-tag mode', () => {
    const diff = computeTagDiffs({
      ...base,
      mode: 'special-tag',
      existingTags: [REMOVED],
      userTagIds: [],
    })
    expect(diff).toEqual({ toAdd: [], toRemove: [], addRemovedTag: false })
  })

  it('clears the removed tag when a user wants the item again in special-tag mode', () => {
    const diff = computeTagDiffs({
      ...base,
      mode: 'special-tag',
      existingTags: [REMOVED],
      userTagIds: [ALICE],
    })
    expect(diff.toAdd).toEqual([ALICE])
    expect(diff.toRemove).toEqual([REMOVED])
    expect(diff.addRemovedTag).toBe(false)
  })
})
