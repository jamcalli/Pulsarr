import type { RemovedTagMode } from '@root/types/config.types.js'
import { isAppUserTag, isRemovedTag } from './tag-predicate.js'

export interface TagDiffInput {
  existingTags: number[]
  userTagIds: number[]
  /** Tag id to lowercased label for every tag on the instance. */
  tagIdMap: Map<number, string>
  mode: RemovedTagMode
  tagPrefix: string
  removedTagPrefix: string
}

export interface TagDiff {
  toAdd: number[]
  toRemove: number[]
  /** The caller must resolve or create the removed tag and add it to the item. */
  addRemovedTag: boolean
}

export function computeTagDiffs(input: TagDiffInput): TagDiff {
  const { existingTags, userTagIds, tagIdMap, mode } = input
  const existingTagSet = new Set(existingTags)
  const removedLabel = input.removedTagPrefix.toLowerCase()

  const existingUserTags = existingTags.filter((tagId) => {
    const label = tagIdMap.get(tagId)
    return label !== undefined && isAppUserTag(label, input.tagPrefix)
  })
  const existingRemovalTags = existingTags.filter((tagId) => {
    const label = tagIdMap.get(tagId)
    return label !== undefined && isRemovedTag(label, input.removedTagPrefix)
  })
  const missingUserTags = userTagIds.filter((id) => !existingTagSet.has(id))

  if (mode === 'keep') {
    return {
      toAdd: missingUserTags,
      toRemove:
        userTagIds.length > 0 && existingRemovalTags.length > 0
          ? existingRemovalTags
          : [],
      addRemovedTag: false,
    }
  }

  const staleUserTags = existingUserTags.filter(
    (id) => !userTagIds.includes(id),
  )

  if (mode === 'special-tag' && userTagIds.length === 0) {
    if (staleUserTags.length === 0) {
      return { toAdd: [], toRemove: [], addRemovedTag: false }
    }
    const hasRemovedTag = existingRemovalTags.some(
      (id) => tagIdMap.get(id) === removedLabel,
    )
    return {
      toAdd: [],
      toRemove: [
        ...staleUserTags,
        ...existingRemovalTags.filter(
          (id) => tagIdMap.get(id) !== removedLabel,
        ),
      ],
      addRemovedTag: !hasRemovedTag,
    }
  }

  return {
    toAdd: missingUserTags,
    toRemove: [...staleUserTags, ...existingRemovalTags],
    addRemovedTag: false,
  }
}
