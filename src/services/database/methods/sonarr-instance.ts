import type { SonarrInstanceRow } from '@root/types/database-rows.types.js'
import type { SonarrInstance } from '@root/types/sonarr.types.js'
import type { DatabaseService } from '@services/database.service.js'
import type { Knex } from 'knex'

/**
 * Converts a SonarrInstanceRow from the database into a SonarrInstance object, applying type conversions, default values, and JSON parsing for relevant fields.
 *
 * @param row - The database row representing a Sonarr instance
 * @returns The corresponding SonarrInstance object
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
 * Retrieves all enabled Sonarr instances from the database.
 *
 * @returns A promise that resolves to an array of enabled SonarrInstance objects.
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
 * Retrieves the enabled Sonarr instance marked as default.
 *
 * @returns The default enabled Sonarr instance, or null if none exists.
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
 * Retrieves a Sonarr instance by its unique ID.
 *
 * @param id - The unique identifier of the Sonarr instance.
 * @returns The Sonarr instance if found, or null if no instance exists with the given ID.
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
 * Creates a new Sonarr instance in the database and returns its ID.
 *
 * If the new instance is marked as default, any existing default instance is unset before insertion.
 *
 * @param instance - The Sonarr instance data to create, excluding the ID
 * @returns The ID of the newly created Sonarr instance
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
          instance.monitorNewItems || 'all',
        ),
        search_on_add: instance.searchOnAdd ?? true,
        create_season_folders: instance.createSeasonFolders ?? false,
        tags: Array.isArray(instance.tags)
          ? JSON.stringify(instance.tags)
          : instance.tags || JSON.stringify([]),
        is_default: instance.isDefault ?? false,
        is_enabled: true,
        synced_instances: Array.isArray(instance.syncedInstances)
          ? JSON.stringify(instance.syncedInstances)
          : instance.syncedInstances || JSON.stringify([]),
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
 * Updates the specified Sonarr instance with the provided fields.
 *
 * If the API key is set to "placeholder", the instance is forced to remain the default. Ensures only one default instance exists and applies partial updates to the instance's properties.
 *
 * @param id - The ID of the Sonarr instance to update
 * @param updates - Fields to update on the Sonarr instance
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
          tags: Array.isArray(sanitized.tags)
            ? JSON.stringify(sanitized.tags)
            : sanitized.tags,
        }),
        ...(typeof sanitized.isDefault !== 'undefined' && {
          is_default: sanitized.isDefault,
        }),
        ...(typeof sanitized.syncedInstances !== 'undefined' && {
          synced_instances: Array.isArray(sanitized.syncedInstances)
            ? JSON.stringify(sanitized.syncedInstances)
            : sanitized.syncedInstances,
        }),
        updated_at: this.timestamp,
      })
  })

  this.log.info(`Sonarr instance ${id} updated`)
}

/**
 * Removes all database references to a deleted Sonarr instance, including entries in related junction tables and synced instance arrays of other Sonarr instances.
 *
 * @param deletedId - The ID of the deleted Sonarr instance to remove references for
 * @param trx - Optional transaction to use for database operations
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
          { error: parseError },
          `Error parsing synced_instances for Sonarr instance ${instance.id}`,
        )
      }
    }

    this.log.info(
      `Cleaned up references for deleted Sonarr instance ${deletedId}`,
    )
  } catch (error) {
    this.log.error(
      { error },
      `Error cleaning up references to deleted Sonarr instance ${deletedId}`,
    )
    throw error
  }
}

/**
 * Deletes a Sonarr instance by ID and removes all references to it from related tables.
 *
 * If the deleted instance was the default, promotes the next available enabled instance to default.
 *
 * @param id - The ID of the Sonarr instance to delete
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
    this.log.error({ error }, `Error deleting Sonarr instance ${id}`)
    throw error
  }
}

/**
 * Retrieves a Sonarr instance matching a normalized base URL identifier.
 *
 * The identifier is compared against all stored Sonarr instances after removing protocol, non-alphanumeric characters, and lowercasing the base URL. Used primarily for webhook routing.
 *
 * @param instanceId - The normalized base URL identifier to match
 * @returns A promise resolving to the matching Sonarr instance, or null if none is found
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
      .toLowerCase()

    if (transformedBaseUrl === instanceId.toLowerCase()) {
      return mapRowToSonarrInstance.call(this, instance)
    }
  }

  return null
}
