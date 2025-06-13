import type { DatabaseService } from '@services/database.service.js'
import type { SonarrInstance } from '@root/types/sonarr.types.js'
import type { SonarrInstanceRow } from '@root/types/database-rows.types.js'
import type { Knex } from 'knex'

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

  return instances.map((instance) => ({
    id: instance.id,
    name: instance.name,
    baseUrl: instance.base_url,
    apiKey: instance.api_key,
    qualityProfile: instance.quality_profile,
    rootFolder: instance.root_folder,
    bypassIgnored: Boolean(instance.bypass_ignored),
    seasonMonitoring: instance.season_monitoring || 'all',
    monitorNewItems: (instance.monitor_new_items as 'all' | 'none') || 'all',
    searchOnAdd: this.toBoolean(instance.search_on_add, true),
    createSeasonFolders: this.toBoolean(instance.create_season_folders, false),
    tags: this.safeJsonParse(instance.tags, [], 'sonarr.tags'),
    isDefault: Boolean(instance.is_default),
    syncedInstances: this.safeJsonParse(
      instance.synced_instances,
      [],
      'sonarr.synced_instances',
    ),
    seriesType:
      (instance.series_type as 'standard' | 'anime' | 'daily') || 'standard',
  }))
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

  return {
    id: instance.id,
    name: instance.name,
    baseUrl: instance.base_url,
    apiKey: instance.api_key,
    qualityProfile: instance.quality_profile,
    rootFolder: instance.root_folder,
    bypassIgnored: Boolean(instance.bypass_ignored),
    seasonMonitoring: instance.season_monitoring || 'all',
    monitorNewItems: (instance.monitor_new_items as 'all' | 'none') || 'all',
    searchOnAdd: this.toBoolean(instance.search_on_add, true),
    createSeasonFolders: this.toBoolean(instance.create_season_folders, false),
    tags: this.safeJsonParse(instance.tags, [], 'sonarr.tags'),
    isDefault: Boolean(instance.is_default),
    syncedInstances: this.safeJsonParse(
      instance.synced_instances,
      [],
      'sonarr.synced_instances',
    ),
    seriesType:
      (instance.series_type as 'standard' | 'anime' | 'daily') || 'standard',
  }
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

  return {
    id: instance.id,
    name: instance.name,
    baseUrl: instance.base_url,
    apiKey: instance.api_key,
    qualityProfile: instance.quality_profile,
    rootFolder: instance.root_folder,
    bypassIgnored: Boolean(instance.bypass_ignored),
    seasonMonitoring: instance.season_monitoring || 'all',
    monitorNewItems: (instance.monitor_new_items as 'all' | 'none') || 'all',
    searchOnAdd: this.toBoolean(instance.search_on_add, true),
    createSeasonFolders: this.toBoolean(instance.create_season_folders, false),
    tags: this.safeJsonParse(instance.tags, [], 'sonarr.tags'),
    isDefault: Boolean(instance.is_default),
    syncedInstances: this.safeJsonParse(
      instance.synced_instances,
      [],
      'sonarr.synced_instances',
    ),
    seriesType:
      (instance.series_type as 'standard' | 'anime' | 'daily') || 'standard',
  }
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
  if (instance.isDefault) {
    await this.knex('sonarr_instances')
      .where('is_default', true)
      .update('is_default', false)
  }

  const result = await this.knex('sonarr_instances')
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

  if (!result || !Array.isArray(result) || result.length === 0) {
    throw new Error('No ID returned from database')
  }

  const row = result[0]
  if (typeof row !== 'object' || !('id' in row)) {
    throw new Error('Invalid ID returned from database')
  }

  this.log.info(`Sonarr instance created with ID: ${row.id}`)
  return row.id
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
  if (updates.apiKey === 'placeholder' && updates.isDefault !== true) {
    updates.isDefault = true
    this.log.warn('Forced placeholder instance to remain default')
  }

  // Use a transaction to ensure all operations are atomic
  await this.knex.transaction(async (trx) => {
    // Validate instance default status using the shared helper
    await this.validateInstanceDefaultStatus(
      trx,
      'sonarr_instances',
      id,
      updates.isDefault,
      'Sonarr',
    )

    // Finally, update the instance with all changes
    await trx('sonarr_instances')
      .where('id', id)
      .update({
        ...(typeof updates.name !== 'undefined' && { name: updates.name }),
        ...(typeof updates.baseUrl !== 'undefined' && {
          base_url: updates.baseUrl,
        }),
        ...(typeof updates.apiKey !== 'undefined' && {
          api_key: updates.apiKey,
        }),
        ...(typeof updates.qualityProfile !== 'undefined' && {
          quality_profile: updates.qualityProfile,
        }),
        ...(typeof updates.rootFolder !== 'undefined' && {
          root_folder: updates.rootFolder,
        }),
        ...(typeof updates.bypassIgnored !== 'undefined' && {
          bypass_ignored: updates.bypassIgnored,
        }),
        ...(typeof updates.seasonMonitoring !== 'undefined' && {
          season_monitoring: updates.seasonMonitoring,
        }),
        ...(typeof updates.monitorNewItems !== 'undefined' && {
          monitor_new_items: this.normaliseMonitorNewItems(
            updates.monitorNewItems,
          ),
        }),
        ...(typeof updates.searchOnAdd !== 'undefined' && {
          search_on_add: updates.searchOnAdd,
        }),
        ...(typeof updates.createSeasonFolders !== 'undefined' && {
          create_season_folders: updates.createSeasonFolders,
        }),
        ...(typeof updates.seriesType !== 'undefined' && {
          series_type: updates.seriesType,
        }),
        ...(typeof updates.tags !== 'undefined' && {
          tags: JSON.stringify(updates.tags),
        }),
        ...(typeof updates.isDefault !== 'undefined' && {
          is_default: updates.isDefault,
        }),
        ...(typeof updates.syncedInstances !== 'undefined' && {
          synced_instances: JSON.stringify(updates.syncedInstances),
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
 * Retrieves a Sonarr instance by ID or name
 *
 * @param identifier - Instance ID (number) or name (string)
 * @returns Promise resolving to the Sonarr instance if found, null otherwise
 */
export async function getSonarrInstanceByIdentifier(
  this: DatabaseService,
  identifier: string | number,
): Promise<SonarrInstance | null> {
  let instance: SonarrInstanceRow | undefined

  if (typeof identifier === 'number') {
    instance = await this.knex('sonarr_instances')
      .where({ id: identifier })
      .first()
  } else {
    instance = await this.knex('sonarr_instances')
      .where({ name: identifier })
      .first()
  }

  if (!instance) return null

  return {
    id: instance.id,
    name: instance.name,
    baseUrl: instance.base_url,
    apiKey: instance.api_key,
    qualityProfile: instance.quality_profile,
    rootFolder: instance.root_folder,
    bypassIgnored: Boolean(instance.bypass_ignored),
    seasonMonitoring: instance.season_monitoring || 'all',
    monitorNewItems: (instance.monitor_new_items as 'all' | 'none') || 'all',
    searchOnAdd: this.toBoolean(instance.search_on_add, true),
    createSeasonFolders: this.toBoolean(instance.create_season_folders, false),
    tags: this.safeJsonParse(instance.tags, [], 'sonarr.tags'),
    isDefault: Boolean(instance.is_default),
    syncedInstances: this.safeJsonParse(
      instance.synced_instances,
      [],
      'sonarr.synced_instances',
    ),
    seriesType:
      (instance.series_type as 'standard' | 'anime' | 'daily') || 'standard',
  }
}
