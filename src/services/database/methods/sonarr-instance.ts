import type { DatabaseService } from '@services/database.service.js'
import type { SonarrInstance } from '@root/types/sonarr.types.js'
import type { SonarrInstanceRow } from '@root/types/database-rows.types.js'
import type { Knex } from 'knex'

/**
 * Maps a database row to a SonarrInstance object
 * @param row - The database row to map
 * @returns Mapped SonarrInstance object
 */
function mapRowToSonarrInstance(
  this: DatabaseService,
  row: SonarrInstanceRow,
): SonarrInstance {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    apiKey: row.api_key,
    qualityProfile: row.quality_profile,
    rootFolder: row.root_folder,
    bypassIgnored: Boolean(row.bypass_ignored),
    seasonMonitoring: row.season_monitoring || 'all',
    monitorNewItems: (row.monitor_new_items as 'all' | 'none') || 'all',
    searchOnAdd: this.toBoolean(row.search_on_add, true),
    createSeasonFolders: this.toBoolean(row.create_season_folders, false),
    tags: this.safeJsonParse(row.tags, [], 'sonarr.tags'),
    isDefault: Boolean(row.is_default),
    syncedInstances: this.safeJsonParse(
      row.synced_instances,
      [],
      'sonarr.synced_instances',
    ),
    seriesType:
      (row.series_type as 'standard' | 'anime' | 'daily') || 'standard',
  }
}

/**
 * Retrieves all enabled Sonarr instances
 *
 * @returns Promise resolving to an array of all enabled Sonarr instances
 */
export async function getAllSonarrInstances(
  this: DatabaseService,
): Promise<SonarrInstance[]> {
  const instances = await this.knex('sonarr_instances')
    .where('is_enabled', true)
    .select('*')

  return instances.map((instance) =>
    mapRowToSonarrInstance.call(this, instance),
  )
}

/**
 * Retrieves the default Sonarr instance
 *
 * @returns Promise resolving to the default Sonarr instance if found, null otherwise
 */
export async function getDefaultSonarrInstance(
  this: DatabaseService,
): Promise<SonarrInstance | null> {
  const instance = await this.knex('sonarr_instances')
    .where({
      is_default: true,
      is_enabled: true,
    })
    .first()

  if (!instance) return null

  return mapRowToSonarrInstance.call(this, instance)
}

/**
 * Retrieves a specific Sonarr instance by ID
 *
 * @param id - ID of the Sonarr instance to retrieve
 * @returns Promise resolving to the Sonarr instance if found, null otherwise
 */
export async function getSonarrInstance(
  this: DatabaseService,
  id: number,
): Promise<SonarrInstance | null> {
  const instance = await this.knex('sonarr_instances').where({ id }).first()

  if (!instance) return null

  return mapRowToSonarrInstance.call(this, instance)
}

/**
 * Creates a new Sonarr instance
 *
 * @param instance - Sonarr instance data excluding ID
 * @returns Promise resolving to the ID of the created instance
 */
export async function createSonarrInstance(
  this: DatabaseService,
  instance: Omit<SonarrInstance, 'id'>,
): Promise<number> {
  return await this.knex.transaction(async (trx) => {
    if (instance.isDefault) {
      await trx('sonarr_instances')
        .where('is_default', true)
        .update('is_default', false)
    }

    const result = await trx('sonarr_instances')
      .insert({
        name: instance.name || 'Default Sonarr Instance',
        base_url: instance.baseUrl,
        api_key: instance.apiKey,
        quality_profile: instance.qualityProfile,
        root_folder: instance.rootFolder,
        bypass_ignored: instance.bypassIgnored,
        season_monitoring: instance.seasonMonitoring,
        monitor_new_items: this.normaliseMonitorNewItems(
          instance.monitorNewItems,
        ),
        search_on_add: instance.searchOnAdd ?? true,
        create_season_folders: instance.createSeasonFolders ?? false,
        tags: JSON.stringify(instance.tags || []),
        is_default: instance.isDefault ?? false,
        is_enabled: true,
        synced_instances: JSON.stringify(instance.syncedInstances || []),
        series_type: instance.seriesType || 'standard',
        created_at: this.timestamp,
        updated_at: this.timestamp,
      })
      .returning('id')

    const id = this.extractId(result)
    this.log.info(`Sonarr instance created with ID: ${id}`)
    return id
  })
}

/**
 * Updates an existing Sonarr instance
 *
 * @param id - ID of the Sonarr instance to update
 * @param updates - Partial Sonarr instance data to update
 * @returns Promise resolving to void when complete
 */
export async function updateSonarrInstance(
  this: DatabaseService,
  id: number,
  updates: Partial<SonarrInstance>,
): Promise<void> {
  // Force placeholder instances to be default (regardless of whether isDefault is false or undefined)
  const sanitized = { ...updates }
  if (sanitized.apiKey === 'placeholder' && sanitized.isDefault !== true) {
    sanitized.isDefault = true
    this.log.warn('Forced placeholder instance to remain default')
  }

  // Use a transaction to ensure all operations are atomic
  await this.knex.transaction(async (trx) => {
    // Validate instance default status using the shared helper
    await this.validateInstanceDefaultStatus(
      trx,
      'sonarr_instances',
      id,
      sanitized.isDefault,
      'Sonarr',
    )

    // Finally, update the instance with all changes
    await trx('sonarr_instances')
      .where('id', id)
      .update({
        ...(typeof sanitized.name !== 'undefined' && { name: sanitized.name }),
        ...(typeof sanitized.baseUrl !== 'undefined' && {
          base_url: sanitized.baseUrl,
        }),
        ...(typeof sanitized.apiKey !== 'undefined' && {
          api_key: sanitized.apiKey,
        }),
        ...(typeof sanitized.qualityProfile !== 'undefined' && {
          quality_profile: sanitized.qualityProfile,
        }),
        ...(typeof sanitized.rootFolder !== 'undefined' && {
          root_folder: sanitized.rootFolder,
        }),
        ...(typeof sanitized.bypassIgnored !== 'undefined' && {
          bypass_ignored: sanitized.bypassIgnored,
        }),
        ...(typeof sanitized.seasonMonitoring !== 'undefined' && {
          season_monitoring: sanitized.seasonMonitoring,
        }),
        ...(typeof sanitized.monitorNewItems !== 'undefined' && {
          monitor_new_items: this.normaliseMonitorNewItems(
            sanitized.monitorNewItems,
          ),
        }),
        ...(typeof sanitized.searchOnAdd !== 'undefined' && {
          search_on_add: sanitized.searchOnAdd,
        }),
        ...(typeof sanitized.createSeasonFolders !== 'undefined' && {
          create_season_folders: sanitized.createSeasonFolders,
        }),
        ...(typeof sanitized.seriesType !== 'undefined' && {
          series_type: sanitized.seriesType,
        }),
        ...(typeof sanitized.tags !== 'undefined' && {
          tags: JSON.stringify(sanitized.tags),
        }),
        ...(typeof sanitized.isDefault !== 'undefined' && {
          is_default: sanitized.isDefault,
        }),
        ...(typeof sanitized.syncedInstances !== 'undefined' && {
          synced_instances: JSON.stringify(sanitized.syncedInstances),
        }),
        updated_at: this.timestamp,
      })
  })

  this.log.info(`Sonarr instance ${id} updated`)
}

/**
 * Cleans up references to a deleted Sonarr instance
 *
 * @param deletedId - ID of the deleted Sonarr instance
 * @param trx - Optional Knex transaction object
 * @returns Promise resolving to void when complete
 */
export async function cleanupDeletedSonarrInstanceReferences(
  this: DatabaseService,
  deletedId: number,
  trx?: Knex.Transaction,
): Promise<void> {
  try {
    // Use the provided transaction or the regular knex instance
    const queryBuilder = trx || this.knex

    // Clean up junction table references
    await queryBuilder('watchlist_sonarr_instances')
      .where('sonarr_instance_id', deletedId)
      .del()

    // Clean up synced_instances references in other instances
    const instances = await queryBuilder('sonarr_instances').select(
      'id',
      'synced_instances',
    )

    for (const instance of instances) {
      try {
        const syncedInstances = this.safeJsonParse<number[]>(
          instance.synced_instances,
          [],
          'synced_instances',
        )

        if (
          Array.isArray(syncedInstances) &&
          syncedInstances.includes(deletedId)
        ) {
          const updatedInstances = syncedInstances.filter(
            (id) => id !== deletedId,
          )

          await queryBuilder('sonarr_instances')
            .where('id', instance.id)
            .update({
              synced_instances: JSON.stringify(updatedInstances),
              updated_at: this.timestamp,
            })

          this.log.debug(
            `Removed deleted Sonarr instance ${deletedId} from synced_instances of instance ${instance.id}`,
          )
        }
      } catch (parseError) {
        this.log.error(
          `Error parsing synced_instances for Sonarr instance ${instance.id}:`,
          parseError,
        )
      }
    }

    this.log.info(
      `Cleaned up references for deleted Sonarr instance ${deletedId}`,
    )
  } catch (error) {
    this.log.error(
      `Error cleaning up references to deleted Sonarr instance ${deletedId}:`,
      error,
    )
    throw error
  }
}

/**
 * Deletes a Sonarr instance and cleans up references to it
 *
 * @param id - ID of the Sonarr instance to delete
 * @returns Promise resolving to void when complete
 */
export async function deleteSonarrInstance(
  this: DatabaseService,
  id: number,
): Promise<void> {
  try {
    // Check if this is a default instance before deleting
    const instanceToDelete = await this.knex('sonarr_instances')
      .where('id', id)
      .first()

    if (!instanceToDelete) {
      this.log.warn(`Sonarr instance ${id} not found for deletion`)
      return
    }

    const isDefault =
      instanceToDelete?.is_default === 1 ||
      instanceToDelete?.is_default === true

    // Use a transaction to ensure atomicity across all operations
    await this.knex.transaction(async (trx) => {
      // First clean up references to this instance with transaction
      await this.cleanupDeletedSonarrInstanceReferences(id, trx)

      // Delete the instance
      await trx('sonarr_instances').where('id', id).delete()

      // If this was a default instance, set a new default if any instances remain
      if (isDefault) {
        const remainingInstances = await trx('sonarr_instances')
          .where('is_enabled', true)
          .orderBy('id')
          .select('id')
          .first()

        if (remainingInstances) {
          await trx('sonarr_instances')
            .where('id', remainingInstances.id)
            .update({
              is_default: true,
              updated_at: this.timestamp,
            })

          this.log.info(
            `Set Sonarr instance ${remainingInstances.id} as new default after deleting instance ${id}`,
          )
        }
      }
    })

    this.log.info(`Deleted Sonarr instance ${id} and cleaned up references`)
  } catch (error) {
    this.log.error(`Error deleting Sonarr instance ${id}:`, error)
    throw error
  }
}

/**
 * Retrieves a Sonarr instance by transformed base URL identifier (original behavior)
 * Used for webhook routing where instanceId comes from URL transformation
 *
 * @param instanceId - Transformed base URL identifier (string)
 * @returns Promise resolving to the Sonarr instance if found, null otherwise
 */
export async function getSonarrInstanceByIdentifier(
  this: DatabaseService,
  instanceId: string,
): Promise<SonarrInstance | null> {
  const instances = await this.knex('sonarr_instances').select()

  for (const instance of instances) {
    const transformedBaseUrl = instance.base_url
      .replace(/https?:\/\//, '')
      .replace(/[^a-zA-Z0-9]/g, '')

    if (transformedBaseUrl === instanceId) {
      return mapRowToSonarrInstance.call(this, instance)
    }
  }

  return null
}
