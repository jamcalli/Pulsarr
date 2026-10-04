import type { ItemTagUpdate, TagDetail } from '../types.js'

/** Inverts per-tag item lists into one update per item carrying every listed tag found on it. */
export function groupTagsByItem(
  tags: Array<Pick<TagDetail, 'id' | 'itemIds'>>,
): ItemTagUpdate[] {
  const tagsByItem = new Map<number, number[]>()
  for (const tag of tags) {
    for (const itemId of tag.itemIds) {
      const itemTags = tagsByItem.get(itemId)
      if (itemTags) {
        if (!itemTags.includes(tag.id)) itemTags.push(tag.id)
      } else {
        tagsByItem.set(itemId, [tag.id])
      }
    }
  }
  return Array.from(tagsByItem, ([itemId, tagIds]) => ({ itemId, tagIds }))
}
