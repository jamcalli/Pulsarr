import type { User } from '@root/types/config.types.js'
import { getArrSource } from '../arr-adapter.js'
import {
  getTagSettings,
  getUserTagLabel,
  isTaggingEnabled,
} from '../tag-operations/tag-predicate.js'
import type {
  ArrAdapter,
  ArrType,
  CreateResults,
  UserTagDeps,
} from '../types.js'
import { ensureMigrationComplete } from './migration-gate.js'

export interface InstanceTagMaps {
  /** Lowercased label to tag id. */
  tagLabelMap: Map<string, number>
  /** Tag id to lowercased label. */
  tagIdMap: Map<number, string>
  failedCount: number
  createdCount: number
}

export async function ensureUserTags(
  adapter: ArrAdapter,
  users: User[],
  deps: Pick<UserTagDeps, 'logger' | 'config'>,
): Promise<InstanceTagMaps> {
  const { tagPrefix, tagNamingSource } = getTagSettings(deps.config)
  const existingTags = await adapter.getTags()
  const tagLabelMap = new Map<string, number>()
  const tagIdMap = new Map<number, string>()
  let failedCount = 0
  let createdCount = 0

  for (const tag of existingTags) {
    const lowerLabel = tag.label.toLowerCase()
    tagLabelMap.set(lowerLabel, tag.id)
    tagIdMap.set(tag.id, lowerLabel)
  }

  const tagsToCreate = users
    .map((user) => ({
      user,
      label: getUserTagLabel(user, tagPrefix, tagNamingSource),
    }))
    .filter(({ label }) => !tagLabelMap.has(label.toLowerCase()))

  if (tagsToCreate.length > 0) {
    deps.logger.debug(`Need to create ${tagsToCreate.length} missing user tags`)
  } else {
    deps.logger.debug(
      `All user tags already exist (${existingTags.length} total tags)`,
    )
  }

  for (const { user, label } of tagsToCreate) {
    try {
      const newTag = await adapter.createTag(label)
      const lowerLabel = label.toLowerCase()
      tagLabelMap.set(lowerLabel, newTag.id)
      tagIdMap.set(newTag.id, lowerLabel)
      createdCount++
      deps.logger.debug(
        `Created tag "${label}" with ID ${newTag.id} for user ${user.name}`,
      )
    } catch (error) {
      deps.logger.error(
        { error },
        `Failed to create tag "${label}" for user ${user.name}:`,
      )
      failedCount++
    }
  }

  return { tagLabelMap, tagIdMap, failedCount, createdCount }
}

export async function createUserTags(
  type: ArrType,
  deps: UserTagDeps,
): Promise<CreateResults> {
  const source = getArrSource(type, deps)
  const results: CreateResults = {
    created: 0,
    skipped: 0,
    failed: 0,
    instances: 0,
  }

  if (!isTaggingEnabled(deps.config, type)) {
    deps.logger.debug(
      `${source.displayName} user tagging disabled, skipping tag creation`,
    )
    return results
  }

  try {
    await ensureMigrationComplete(type, deps)

    const instances = await source.getInstances()
    results.instances = instances.length

    for (const instance of instances) {
      try {
        const adapter = source.getAdapter(instance)
        if (!adapter) {
          deps.logger.warn(
            `${source.displayName} service for instance ${instance.name} not found, skipping tag creation`,
          )
          continue
        }

        const users = await adapter.usersWithItems()
        const { failedCount, createdCount } = await ensureUserTags(
          adapter,
          users,
          deps,
        )
        const skippedCount = users.length - createdCount - failedCount

        results.created += createdCount
        results.failed += failedCount
        results.skipped += Math.max(skippedCount, 0)

        deps.logger.debug(
          {
            instance: instance.name,
            instanceId: instance.id,
            usersWithItems: users.length,
            created: createdCount,
            skipped: skippedCount,
            failed: failedCount,
          },
          `Processed user tags for ${source.displayName} instance`,
        )
      } catch (instanceError) {
        deps.logger.error(
          { error: instanceError },
          `Error processing tags for ${source.displayName} instance ${instance.name}:`,
        )
      }
    }

    await deps.migration.cleanupMigrationFileIfComplete()
    return results
  } catch (error) {
    deps.logger.error(
      { error },
      `Error creating ${source.displayName} user tags:`,
    )
    throw error
  }
}
