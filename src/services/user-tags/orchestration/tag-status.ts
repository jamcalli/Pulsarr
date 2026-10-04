import type { NamingSource } from '@utils/tag-normalization.js'
import { getArrSource } from '../arr-adapter.js'
import {
  getTagSettings,
  isAppUserTag,
  isTaggingEnabled,
} from '../tag-operations/tag-predicate.js'
import {
  type ArrType,
  type TagStatus,
  type TagStatusInstance,
  TagStatusUnavailableError,
  type UserTagDeps,
  UserTagsExistError,
} from '../types.js'

const ARR_TYPES: ArrType[] = ['sonarr', 'radarr']

async function statusForType(
  type: ArrType,
  deps: UserTagDeps,
): Promise<TagStatusInstance[]> {
  const source = getArrSource(type, deps)
  const { tagPrefix } = getTagSettings(deps.config)
  const enabled = isTaggingEnabled(deps.config, type)
  const instances = await source.getInstances()

  return Promise.all(
    instances.map(async (instance): Promise<TagStatusInstance> => {
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
        const adapter = source.getAdapter(instance)
        if (!adapter) return unknown
        const userTags = (await adapter.getTagDetails()).filter((tag) =>
          isAppUserTag(tag.label, tagPrefix),
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
          `Error reading user tag status from ${source.displayName} instance ${instance.name}`,
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
}

/** Throws UserTagsExistError when the update changes the prefix or naming source while user tags remain. */
export async function assertPrefixChangeAllowed(
  update: TagNamingUpdate,
  deps: UserTagDeps,
): Promise<void> {
  const { tagPrefix, tagNamingSource } = getTagSettings(deps.config)
  const changed =
    (update.tagPrefix !== undefined && update.tagPrefix !== tagPrefix) ||
    (update.tagNamingSource !== undefined &&
      update.tagNamingSource !== tagNamingSource)
  if (!changed) return

  const { tagsExist, instances } = await getTagStatus(deps)
  if (tagsExist) throw new UserTagsExistError()
  const unreachable = instances.filter((instance) => !instance.reachable)
  if (unreachable.length > 0) {
    throw new TagStatusUnavailableError(
      unreachable.map((instance) => instance.name),
    )
  }
}
