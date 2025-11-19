/**
 * Tag Migration Service
 *
 * Handles one-time migration of tags from colon format to hyphen format
 * for Radarr v6/Sonarr compatibility.
 *
 * Radarr v6 introduced strict tag validation that only accepts lowercase letters,
 * numbers, and hyphens. This service migrates existing colon-based tags
 * (e.g., 'pulsarr:user:username') to hyphen-based format (e.g., 'pulsarr-user-username').
 *
 * Migration process:
 * 1. Creates new hyphen-based tags in Radarr/Sonarr
 * 2. Bulk updates all content to use new tags
 * 3. Deletes old colon-based tags
 * 4. Tracks migration status per-instance in config
 *
 * @see https://github.com/Radarr/Radarr/commit/62a05e2765ee603fa1a48806f1f20ccc936d8b8c
 */

import { readFile, unlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Path resolution following the same pattern as logger.ts and knexfile.ts
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, '../..')

/**
 * Get the path to the pre-migration prefix file
 * Follows the same pattern as ensureDbDirectory() in knexfile.ts
 */
function getMigrationFilePath(): string {
  return resolve(projectRoot, 'data', '.pulsarr-tag-migration.json')
}

import { createServiceLogger } from '@utils/logger.js'
import { normalizeTagLabel } from '@utils/tag-normalization.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

/**
 * Tag structure returned from Sonarr/Radarr APIs
 */
interface Tag {
  id: number
  label: string
}

/**
 * Mapping between old colon-based tag and new hyphen-based tag
 */
interface TagMapping {
  oldId: number
  newId: number
  oldLabel: string
  newLabel: string
}

/**
 * Result of migrating a single instance
 */
interface InstanceMigrationResult {
  instanceId: number
  instanceName: string
  tagsMigrated: number
  contentUpdated: number
  success: boolean
  error?: string
}

/**
 * Pre-migration prefix values stored in data/.pulsarr-tag-migration.json
 * by database migration 064
 */
interface PreMigrationPrefixes {
  tagPrefix: string
  removedTagPrefix: string
  migratedAt: string
}

/**
 * Service to migrate tags from colon format to hyphen format
 */
export class TagMigrationService {
  /** Creates a fresh service logger that inherits current log level */
  private get log(): FastifyBaseLogger {
    return createServiceLogger(this.baseLog, 'TAG_MIGRATION')
  }

  constructor(
    private readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {}

  /**
   * Get pre-migration prefix values from file written by database migration 064
   * Falls back to hardcoded legacy defaults if file doesn't exist
   */
  private async getPreMigrationPrefixes(): Promise<PreMigrationPrefixes> {
    try {
      const migrationFile = getMigrationFilePath()
      const fileContent = await readFile(migrationFile, 'utf-8')
      const data = JSON.parse(fileContent) as PreMigrationPrefixes

      this.log.debug(
        `Loaded pre-migration prefixes from file: tagPrefix="${data.tagPrefix}", removedTagPrefix="${data.removedTagPrefix}"`,
      )

      return data
    } catch (error) {
      // File doesn't exist or is unreadable - try to derive prefixes from current config
      // This can happen if:
      // 1. User already ran tag migration and file was deleted
      // 2. Fresh install (no migration needed)
      // 3. Database migration failed to write file
      this.log.debug(
        { error },
        'Could not read pre-migration prefix file, checking current config',
      )

      // If current config still has colon prefixes, use those (migration hasn't run yet)
      // This protects custom prefixes when migration file write failed
      const currentTagPrefix = this.fastify.config.tagPrefix
      const currentRemovedPrefix = this.fastify.config.removedTagPrefix

      if (
        currentTagPrefix.includes(':') ||
        currentRemovedPrefix.includes(':')
      ) {
        this.log.debug(
          `Using colon prefixes from current config: tagPrefix="${currentTagPrefix}", removedTagPrefix="${currentRemovedPrefix}"`,
        )
        return {
          tagPrefix: currentTagPrefix,
          removedTagPrefix: currentRemovedPrefix,
          migratedAt: new Date().toISOString(),
        }
      }

      // Config already has hyphen format - fall back to hardcoded legacy defaults
      // (migration already completed or fresh install with hyphen prefixes)
      this.log.debug(
        'Current config already hyphenated, using hardcoded legacy defaults',
      )
      return {
        tagPrefix: 'pulsarr:user',
        removedTagPrefix: 'pulsarr:removed',
        migratedAt: new Date().toISOString(),
      }
    }
  }

  /**
   * Delete the pre-migration prefix file after successful migration
   * @returns true if file was deleted, false if it didn't exist
   */
  private async deletePreMigrationFile(): Promise<boolean> {
    try {
      const migrationFile = getMigrationFilePath()
      await unlink(migrationFile)
      this.log.info('Deleted pre-migration prefix file')
      return true
    } catch (error) {
      // File might already be deleted or not exist - this is fine
      this.log.debug(
        { error },
        'Could not delete pre-migration prefix file (may already be deleted)',
      )
      return false
    }
  }

  /**
   * Migrate tags for all instances of a given type (Radarr or Sonarr)
   *
   * @param instanceType - Type of instance to migrate ('radarr' or 'sonarr')
   * @returns Array of migration results for each instance
   */
  async migrateInstanceTags(
    instanceType: 'radarr' | 'sonarr',
  ): Promise<InstanceMigrationResult[]> {
    this.log.info(
      `Starting tag migration for ${instanceType} instances (colon -> hyphen format)`,
    )

    const manager =
      instanceType === 'radarr'
        ? this.fastify.radarrManager
        : this.fastify.sonarrManager

    const instances = await manager.getAllInstances()
    const results: InstanceMigrationResult[] = []

    for (const instance of instances) {
      try {
        const result = await this.migrateInstance(
          instanceType,
          instance.id,
          instance.name,
        )
        results.push(result)
      } catch (error) {
        this.log.error(
          { error, instanceId: instance.id, instanceName: instance.name },
          `Failed to migrate ${instanceType} instance ${instance.name}:`,
        )
        results.push({
          instanceId: instance.id,
          instanceName: instance.name,
          tagsMigrated: 0,
          contentUpdated: 0,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // Update global tag prefixes after all instances are processed
    await this.updateGlobalTagPrefixes()

    return results
  }

  /**
   * Migrate tags for a single instance
   */
  private async migrateInstance(
    instanceType: 'radarr' | 'sonarr',
    instanceId: number,
    instanceName: string,
  ): Promise<InstanceMigrationResult> {
    // Check if this instance already migrated
    // Convert instanceId to string since JSON keys are always strings
    const migrationData =
      this.fastify.config.tagMigration?.[instanceType]?.[String(instanceId)]

    if (migrationData?.completed) {
      this.log.debug(
        `Instance ${instanceName} (${instanceType}) already migrated, skipping`,
      )
      return {
        instanceId,
        instanceName,
        tagsMigrated: migrationData.tagsMigrated || 0,
        contentUpdated: migrationData.contentUpdated || 0,
        success: true,
      }
    }

    // Get pre-migration prefix values to identify tags correctly
    const preMigrationPrefixes = await this.getPreMigrationPrefixes()

    // Get the service for this instance
    const service =
      instanceType === 'radarr'
        ? this.fastify.radarrManager.getRadarrService(instanceId)
        : this.fastify.sonarrManager.getSonarrService(instanceId)

    if (!service) {
      throw new Error(
        `Could not get service for ${instanceType} instance ${instanceId}`,
      )
    }

    // 1. Get all tags from the instance
    this.log.debug(`Fetching tags from ${instanceName}`)
    const allTags = await service.getTags()

    // 2. Find tags with colons that need migration
    // Only migrate our app's tags using the original prefix values
    const colonTags = allTags.filter((t) => {
      const lower = t.label.toLowerCase()

      // Extract the user tag prefix from the original tagPrefix
      // e.g., 'pulsarr:user' or 'myapp:user' -> check for 'pulsarr:user:' or 'myapp:user:'
      const userTagPrefix = preMigrationPrefixes.tagPrefix.toLowerCase()
      const removedPrefix = preMigrationPrefixes.removedTagPrefix.toLowerCase()

      return (
        lower.includes(':') &&
        (lower.startsWith(`${userTagPrefix}:`) ||
          lower.startsWith(removedPrefix))
      )
    })

    if (colonTags.length === 0) {
      this.log.info(
        `No tags with colons found in ${instanceType} instance ${instanceName}, marking as migrated`,
      )
      await this.markInstanceAsMigrated(instanceType, instanceId, 0, 0)
      return {
        instanceId,
        instanceName,
        tagsMigrated: 0,
        contentUpdated: 0,
        success: true,
      }
    }

    this.log.info(
      `Found ${colonTags.length} colon-based tags in ${instanceName} that need migration`,
    )

    // 3. Create new hyphen tags and build mapping
    const tagMapping = await this.createNewTags(
      service,
      colonTags,
      allTags,
      instanceName,
    )

    // 4. Get all content with full details (including tags) and perform bulk updates
    this.log.debug(`Fetching content from ${instanceName}`)

    let updates: Array<{
      movieId?: number
      seriesId?: number
      tagIds: number[]
    }> = []

    if (instanceType === 'radarr') {
      const radarrService = service as {
        getFromRadarr(
          endpoint: string,
        ): Promise<Array<{ id: number; tags?: number[] }>>
        bulkUpdateMovieTags(
          updates: Array<{ movieId: number; tagIds: number[] }>,
        ): Promise<void>
      }

      const allMovies = await radarrService.getFromRadarr('movie')
      const contentMap = new Map(allMovies.map((c) => [c.id, c]))

      updates = this.buildContentUpdates(
        instanceType,
        contentMap,
        colonTags,
        tagMapping,
      )

      this.log.info(
        `Updating ${updates.length} movies with new tag format in ${instanceName}`,
      )

      if (updates.length > 0) {
        const movieUpdates = updates
          .filter(
            (u): u is { movieId: number; tagIds: number[] } =>
              u.movieId !== undefined,
          )
          .map((u) => ({ movieId: u.movieId, tagIds: u.tagIds }))
        await radarrService.bulkUpdateMovieTags(movieUpdates)
      }
    } else {
      const sonarrService = service as {
        getFromSonarr(
          endpoint: string,
        ): Promise<Array<{ id: number; tags?: number[] }>>
        bulkUpdateSeriesTags(
          updates: Array<{ seriesId: number; tagIds: number[] }>,
        ): Promise<void>
      }

      const allSeries = await sonarrService.getFromSonarr('series')
      const contentMap = new Map(allSeries.map((c) => [c.id, c]))

      updates = this.buildContentUpdates(
        instanceType,
        contentMap,
        colonTags,
        tagMapping,
      )

      this.log.info(
        `Updating ${updates.length} series with new tag format in ${instanceName}`,
      )

      if (updates.length > 0) {
        const seriesUpdates = updates
          .filter(
            (u): u is { seriesId: number; tagIds: number[] } =>
              u.seriesId !== undefined,
          )
          .map((u) => ({ seriesId: u.seriesId, tagIds: u.tagIds }))
        await sonarrService.bulkUpdateSeriesTags(seriesUpdates)
      }
    }

    // 7. Delete old tags
    await this.deleteOldTags(service, tagMapping)

    // 8. Mark instance as migrated
    await this.markInstanceAsMigrated(
      instanceType,
      instanceId,
      colonTags.length,
      updates.length,
    )

    this.log.info(
      `Completed migration for ${instanceName}: ${colonTags.length} tags migrated, ${updates.length} ${instanceType === 'radarr' ? 'movies' : 'series'} updated`,
    )

    return {
      instanceId,
      instanceName,
      tagsMigrated: colonTags.length,
      contentUpdated: updates.length,
      success: true,
    }
  }

  /**
   * Create new hyphen-based tags for all old colon-based tags
   */
  private async createNewTags(
    service: {
      getTags(): Promise<Tag[]>
      createTag(label: string): Promise<Tag>
    },
    colonTags: Tag[],
    allTags: Tag[],
    instanceName: string,
  ): Promise<TagMapping[]> {
    const tagMapping: TagMapping[] = []

    for (const oldTag of colonTags) {
      // Transform tag label to Radarr v6 compatible format
      // Uses shared normalization utility (same logic as database migration 064 and getUserTagLabel)
      const newLabel = normalizeTagLabel(oldTag.label)

      // Check if new tag already exists
      const existingNew = allTags.find((t) => t.label === newLabel)
      if (existingNew) {
        this.log.debug(
          `Tag "${newLabel}" already exists in ${instanceName} (ID: ${existingNew.id}), reusing`,
        )
        tagMapping.push({
          oldId: oldTag.id,
          newId: existingNew.id,
          oldLabel: oldTag.label,
          newLabel: newLabel,
        })
        continue
      }

      // Create new tag
      this.log.debug(
        `Creating new tag "${newLabel}" in ${instanceName} to replace "${oldTag.label}"`,
      )
      const newTag = await service.createTag(newLabel)
      // Update allTags so subsequent iterations can find this newly created tag
      // This prevents duplicate creation when multiple old tags normalize to the same new label
      allTags.push(newTag)
      tagMapping.push({
        oldId: oldTag.id,
        newId: newTag.id,
        oldLabel: oldTag.label,
        newLabel: newLabel,
      })
    }

    return tagMapping
  }

  /**
   * Build bulk update operations for all content with old tags
   * Processes ALL content in Radarr/Sonarr, not just watchlist items
   */
  private buildContentUpdates(
    instanceType: 'radarr' | 'sonarr',
    contentMap: Map<number, { id: number; tags?: number[] }>,
    _colonTags: Tag[],
    tagMapping: TagMapping[],
  ): Array<{ movieId?: number; seriesId?: number; tagIds: number[] }> {
    const updates: Array<{
      movieId?: number
      seriesId?: number
      tagIds: number[]
    }> = []

    // Build lookup structures for O(1) performance instead of nested loops
    const oldIds = new Set(tagMapping.map((m) => m.oldId))
    const idMap = new Map(tagMapping.map((m) => [m.oldId, m.newId] as const))

    // Process ALL content in Radarr/Sonarr, not just watchlist items
    // This ensures we migrate tags on content that was removed from watchlist
    for (const [contentId, contentDetails] of contentMap) {
      const currentTags = contentDetails.tags || []

      // Check if content has any old tags (O(n) instead of O(n*m))
      const hasOldTags = currentTags.some((tagId: number) => oldIds.has(tagId))

      if (!hasOldTags) continue

      // Replace old tag IDs with new tag IDs and dedupe to avoid duplicates (O(n) instead of O(n*m))
      const mappedTagIds = currentTags.map(
        (tagId: number) => idMap.get(tagId) ?? tagId,
      )
      const newTagIds = [...new Set(mappedTagIds)]

      if (instanceType === 'radarr') {
        updates.push({ movieId: contentId, tagIds: newTagIds })
      } else {
        updates.push({ seriesId: contentId, tagIds: newTagIds })
      }
    }

    return updates
  }

  /**
   * Delete all old colon-based tags
   */
  private async deleteOldTags(
    service: { deleteTag(tagId: number): Promise<void> },
    tagMapping: TagMapping[],
  ): Promise<void> {
    for (const mapping of tagMapping) {
      try {
        await service.deleteTag(mapping.oldId)
        this.log.debug(
          `Deleted old tag: "${mapping.oldLabel}" (ID: ${mapping.oldId})`,
        )
      } catch (deleteError) {
        this.log.warn(
          { error: deleteError, tagId: mapping.oldId, label: mapping.oldLabel },
          `Failed to delete old tag "${mapping.oldLabel}" (ID: ${mapping.oldId})`,
        )
      }
    }
  }

  /**
   * Mark an instance as migrated in the config
   */
  private async markInstanceAsMigrated(
    instanceType: 'radarr' | 'sonarr',
    instanceId: number,
    tagsMigrated: number,
    contentUpdated: number,
  ): Promise<void> {
    // Get existing migration data
    const existingMigration = this.fastify.config.tagMigration || {
      radarr: {},
      sonarr: {},
    }

    // Ensure per-type map exists to avoid runtime errors if config is partially initialized
    if (!existingMigration[instanceType]) {
      existingMigration[instanceType] = {}
    }

    // Update for this instance (convert instanceId to string since JSON keys are strings)
    existingMigration[instanceType][String(instanceId)] = {
      completed: true,
      migratedAt: new Date().toISOString(),
      tagsMigrated,
      contentUpdated,
    }

    // Persist to database first
    await this.fastify.db.updateConfig({
      tagMigration: existingMigration,
    })

    // Then update in-memory config
    try {
      await this.fastify.updateConfig({
        tagMigration: existingMigration,
      })
    } catch (memUpdateErr) {
      this.log.error(
        { error: memUpdateErr },
        'DB updated but failed to sync in-memory config - restart may be needed',
      )
      // In-memory config is stale but DB has correct value
      // Next server restart will load correct value from DB
    }
  }

  /**
   * Update global tag prefixes to use hyphen format
   * Transforms existing prefixes rather than replacing with defaults
   */
  private async updateGlobalTagPrefixes(): Promise<void> {
    const currentPrefix = this.fastify.config.tagPrefix || 'pulsarr-user'
    const currentRemovedPrefix =
      this.fastify.config.removedTagPrefix || 'pulsarr-removed'

    // Only update if they're still using colon format
    if (currentPrefix.includes(':') || currentRemovedPrefix.includes(':')) {
      this.log.info(
        'Updating global tag prefixes to hyphen format (transforming existing values)',
      )

      const updates: Record<string, string> = {}

      // Transform current prefix by replacing colons with hyphens
      if (currentPrefix.includes(':')) {
        updates.tagPrefix = currentPrefix.replace(/:/g, '-')
      }

      if (currentRemovedPrefix.includes(':')) {
        updates.removedTagPrefix = currentRemovedPrefix.replace(/:/g, '-')
      }

      if (Object.keys(updates).length > 0) {
        // Persist to database first
        await this.fastify.db.updateConfig(updates)

        // Then update in-memory config
        try {
          await this.fastify.updateConfig(updates)
          this.log.info(
            `Transformed prefixes: ${currentPrefix} -> ${updates.tagPrefix || currentPrefix}, ${currentRemovedPrefix} -> ${updates.removedTagPrefix || currentRemovedPrefix}`,
          )
        } catch (memUpdateErr) {
          this.log.error(
            { error: memUpdateErr },
            'DB updated but failed to sync in-memory config - restart may be needed',
          )
          // In-memory config is stale but DB has correct value
          // Next server restart will load correct value from DB
        }
      }
    }
  }

  /**
   * Check if all instances of a given type have been migrated
   */
  async checkAllInstancesMigrated(
    instanceType: 'radarr' | 'sonarr',
  ): Promise<boolean> {
    const manager =
      instanceType === 'radarr'
        ? this.fastify.radarrManager
        : this.fastify.sonarrManager

    const instances = await manager.getAllInstances()

    this.log.debug(
      `Checking ${instanceType} migration status: ${instances.length} instances found`,
    )

    if (instances.length === 0) {
      // No instances configured, consider it "migrated"
      this.log.debug(`No ${instanceType} instances configured, returning true`)
      return true
    }

    const allMigrated = instances.every((instance) => {
      // Convert instance.id to string since JSON keys are strings
      const migrationData =
        this.fastify.config.tagMigration?.[instanceType]?.[String(instance.id)]
      const isComplete = migrationData?.completed === true
      this.log.debug(
        `Instance ${instance.id} (${instance.name}): completed=${isComplete}`,
      )
      return isComplete
    })

    this.log.debug(`All ${instanceType} instances migrated: ${allMigrated}`)
    return allMigrated
  }

  /**
   * Clean up migration file if both radarr AND sonarr migrations are complete
   * Should be called after each sync operation
   */
  async cleanupMigrationFileIfComplete(): Promise<void> {
    const radarrComplete = await this.checkAllInstancesMigrated('radarr')
    const sonarrComplete = await this.checkAllInstancesMigrated('sonarr')

    if (radarrComplete && sonarrComplete) {
      this.log.debug(
        'Both Radarr and Sonarr migrations complete, attempting cleanup',
      )
      const wasDeleted = await this.deletePreMigrationFile()
      if (wasDeleted) {
        this.log.info(
          'Both Radarr and Sonarr migrations complete, cleaned up migration file',
        )
      }
    } else {
      this.log.debug(
        `Migration file cleanup skipped - Radarr: ${radarrComplete ? 'complete' : 'pending'}, Sonarr: ${sonarrComplete ? 'complete' : 'pending'}`,
      )
    }
  }
}
