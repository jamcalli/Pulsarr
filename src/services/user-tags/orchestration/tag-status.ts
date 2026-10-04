import type { NamingSource } from '@utils/tag-normalization.js'
import { listInstances } from '../arr-adapter.js'
import {
  getTagSettings,
  isOwnedTag,
  isTaggingEnabled,
} from '../tag-operations/tag-predicate.js'
import {
  ARR_META,
  type ArrType,
  TagNamingBlockedError,
  type TagStatus,
  type TagStatusInstance,
  type UserTagDeps,
} from '../types.js'

const ARR_TYPES: ArrType[] = ['sonarr', 'radarr']

async function statusForType(
  type: ArrType,
  deps: UserTagDeps,
): Promise<TagStatusInstance[]> {
  const settings = getTagSettings(deps.config)
  const enabled = isTaggingEnabled(deps.config, type)
  const instances = await listInstances(type, deps)

  return Promise.all(
    instances.map(async ({ instance, adapter }): Promise<TagStatusInstance> => {
      const unknown = {
        type,
        instanceId: instance.id,
        name: instance.name,
        enabled,
        reachable: false,
        tagCount: 0,
        taggedItemCount: 0,
      }
      try {
        if (!adapter) return unknown
        const userTags = (await adapter.getTagDetails()).filter((tag) =>
          isOwnedTag(tag.label, settings),
        )
        const taggedItems = new Set(userTags.flatMap((tag) => tag.itemIds))
        return {
          ...unknown,
          reachable: true,
          tagCount: userTags.length,
          taggedItemCount: taggedItems.size,
        }
      } catch (error) {
        deps.logger.error(
          { error },
          `Error reading user tag status from ${ARR_META[type].displayName} instance ${instance.name}`,
        )
        return unknown
      }
    }),
  )
}

/** Every configured instance is reported, including types whose tagging is off, since their tags outlive the switch. */
export async function getTagStatus(deps: UserTagDeps): Promise<TagStatus> {
  const instances = (
    await Promise.all(ARR_TYPES.map((type) => statusForType(type, deps)))
  ).flat()

  return {
    tagsExist: instances.some((instance) => instance.tagCount > 0),
    instances,
  }
}

export interface TagNamingUpdate {
  tagPrefix?: string
  tagNamingSource?: NamingSource
  removedTagPrefix?: string
}

/** Throws TagNamingBlockedError when the update changes the prefix or naming source while user tags remain or an instance cannot be read. */
export async function assertPrefixChangeAllowed(
  update: TagNamingUpdate,
  deps: UserTagDeps,
): Promise<void> {
  const { tagPrefix, tagNamingSource, removedTagPrefix } = getTagSettings(
    deps.config,
  )
  const changed =
    (update.tagPrefix !== undefined && update.tagPrefix !== tagPrefix) ||
    (update.tagNamingSource !== undefined &&
      update.tagNamingSource !== tagNamingSource) ||
    (update.removedTagPrefix !== undefined &&
      update.removedTagPrefix !== removedTagPrefix)
  if (!changed) return

  const { tagsExist, instances } = await getTagStatus(deps)
  if (tagsExist) {
    throw new TagNamingBlockedError(
      'tags-exist',
      'Remove existing user tags before changing the tag prefix, removed tag label or naming source',
    )
  }
  const unreachable = instances.filter((instance) => !instance.reachable)
  if (unreachable.length > 0) {
    const names = unreachable.map((instance) => instance.name).join(', ')
    throw new TagNamingBlockedError(
      'unreachable',
      `Could not verify user tags on ${names}; fix the connection before changing the tag prefix, removed tag label or naming source`,
    )
  }
}
