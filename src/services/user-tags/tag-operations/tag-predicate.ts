import type { Config, User } from '@root/types/config.types.js'
import {
  type NamingSource,
  normalizeTagLabel,
  resolveTagName,
} from '@utils/tag-normalization.js'
import type {
  ArrType,
  ItemTagUpdate,
  TagDetail,
  TagSettings,
} from '../types.js'

/** Also true for a label equal to the bare prefix, which is what the migration leaves for names that sanitized to nothing. */
export function isAppUserTag(label: string, prefix: string): boolean {
  const lowerLabel = label.toLowerCase()
  const lowerPrefix = prefix.toLowerCase()
  return lowerLabel.startsWith(`${lowerPrefix}-`) || lowerLabel === lowerPrefix
}

export function isRemovedTag(label: string, removedPrefix: string): boolean {
  return label.toLowerCase().startsWith(removedPrefix.toLowerCase())
}

export function getUserTagLabel(
  user: Pick<User, 'id' | 'name' | 'alias'>,
  prefix: string,
  namingSource: NamingSource,
): string {
  const sanitizedName = normalizeTagLabel(resolveTagName(user, namingSource))
  return sanitizedName === ''
    ? `${prefix}-id-${user.id}`
    : `${prefix}-${sanitizedName}`
}

export function isTaggingEnabled(config: Config, type: ArrType): boolean {
  return type === 'sonarr' ? config.tagUsersInSonarr : config.tagUsersInRadarr
}

export function getTagSettings(config: Config): TagSettings {
  return {
    tagPrefix: config.tagPrefix || 'pulsarr-user',
    tagNamingSource: config.tagNamingSource,
    removedTagMode: config.removedTagMode || 'remove',
    removedTagPrefix: config.removedTagPrefix || 'pulsarr-removed',
  }
}

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
