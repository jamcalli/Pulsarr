import type { DatabaseService } from '@services/database.service.js'
import type { RadarrInstance } from '@root/types/radarr.types.js'
import type { RadarrInstanceRow } from '@root/types/database-rows.types.js'
import type { Knex } from 'knex'

/**
 * Retrieves all enabled Radarr instances
 *
 * @returns Promise resolving to an array of all enabled Radarr instances
 */
export async function getAllRadarrInstances(
  this: DatabaseService,
): Promise<RadarrInstance[]> {
  const instances = await this.knex('radarr_instances')
    .select('*')
    .where('is_enabled', true)
    .orderBy('name')

  return instances.map((instance) => ({
    ...instance,
    id: instance.id,
    name: instance.name,
    baseUrl: instance.base_url,
    apiKey: instance.api_key,
    qualityProfile: instance.quality_profile,
    rootFolder: instance.root_folder,
    bypassIgnored: Boolean(instance.bypass_ignored),
    searchOnAdd: Boolean(instance.search_on_add ?? true),
    minimumAvailability: this.normaliseMinimumAvailability(
      instance.minimum_availability,
    ),
    tags: this.safeJsonParse<string[]>(
      instance.tags,
      [],
      'radarrInstance.tags',
    ),
    isDefault: Boolean(instance.is_default),
    syncedInstances: this.safeJsonParse<number[]>(
      instance.synced_instances,
      [],
      'radarrInstance.syncedInstances',
    ),
  }))
}

/**
 * Retrieves the default Radarr instance
 *
 * @returns Promise resolving to the default Radarr instance if found, null otherwise
 */
export async function getDefaultRadarrInstance(
  this: DatabaseService,
): Promise<RadarrInstance | null> {
  const instance = await this.knex('radarr_instances')
    .where({ is_default: true, is_enabled: true })
    .first()

  if (!instance) return null

  return {
    ...instance,
    id: instance.id,
    name: instance.name,
    baseUrl: instance.base_url,
    apiKey: instance.api_key,
    qualityProfile: instance.quality_profile,
    rootFolder: instance.root_folder,
    bypassIgnored: Boolean(instance.bypass_ignored),
    searchOnAdd: Boolean(instance.search_on_add ?? true),
    minimumAvailability: this.normaliseMinimumAvailability(
      instance.minimum_availability,
    ),
    tags: this.safeJsonParse<string[]>(
      instance.tags,
      [],
      'radarrInstance.tags',
    ),
    isDefault: Boolean(instance.is_default),
    syncedInstances: this.safeJsonParse<number[]>(
      instance.synced_instances,
      [],
      'radarrInstance.syncedInstances',
    ),
  }
}

/**
 * Retrieves a specific Radarr instance by ID
 *
 * @param id - ID of the Radarr instance to retrieve
 * @returns Promise resolving to the Radarr instance if found, null otherwise
 */
export async function getRadarrInstance(
  this: DatabaseService,
  id: number,
): Promise<RadarrInstance | null> {
  const instance = await this.knex('radarr_instances').where({ id }).first()

  if (!instance) return null

  return {
    ...instance,
    id: instance.id,
    name: instance.name,
    baseUrl: instance.base_url,
    apiKey: instance.api_key,
    qualityProfile: instance.quality_profile,
    rootFolder: instance.root_folder,
    bypassIgnored: Boolean(instance.bypass_ignored),
    searchOnAdd: Boolean(instance.search_on_add ?? true),
    minimumAvailability: this.normaliseMinimumAvailability(
      instance.minimum_availability,
    ),
    tags: this.safeJsonParse<string[]>(
      instance.tags,
      [],
      'radarrInstance.tags',
    ),
    isDefault: Boolean(instance.is_default),
    syncedInstances: this.safeJsonParse<number[]>(
      instance.synced_instances,
      [],
      'radarrInstance.syncedInstances',
    ),
  }
}

/**
 * Creates a new Radarr instance
 *
 * @param instance - Radarr instance data excluding ID
 * @returns Promise resolving to the ID of the created instance
 */
export async function createRadarrInstance(
  this: DatabaseService,
  instance: Omit<RadarrInstance, 'id'>,
): Promise<number> {
  if (instance.isDefault) {
    await this.knex('radarr_instances')
      .where('is_default', true)
      .update('is_default', false)
  }

  const result = await this.knex('radarr_instances')
    .insert({
      name: instance.name || 'Default Radarr Instance',
      base_url: instance.baseUrl,
      api_key: instance.apiKey,
      quality_profile: instance.qualityProfile,
      root_folder: instance.rootFolder,
      bypass_ignored: instance.bypassIgnored,
      search_on_add: instance.searchOnAdd ?? true,
      minimum_availability: this.normaliseMinimumAvailability(
        instance.minimumAvailability,
      ),
      tags: JSON.stringify(instance.tags || []),
      is_default: instance.isDefault ?? false,
      is_enabled: true,
      synced_instances: JSON.stringify(instance.syncedInstances || []),
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

  this.log.info(`Radarr instance created with ID: ${row.id}`)
  return row.id
}

/**
 * Updates an existing Radarr instance
 *
 * @param id - ID of the Radarr instance to update
 * @param updates - Partial Radarr instance data to update
 * @returns Promise resolving to void when complete
 */
export async function updateRadarrInstance(
  this: DatabaseService,
  id: number,
  updates: Partial<RadarrInstance>,
): Promise<void> {
  if (updates.apiKey === 'placeholder' && updates.isDefault !== true) {
    updates.isDefault = true
    this.log.warn('Forced placeholder instance to remain default')
  }

  await this.knex.transaction(async (trx) => {
    await this.validateInstanceDefaultStatus(
      trx,
      'radarr_instances',
      id,
      updates.isDefault,
      'Radarr',
    )

    await trx('radarr_instances')
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
        ...(typeof updates.searchOnAdd !== 'undefined' && {
          search_on_add: updates.searchOnAdd,
        }),
        ...(typeof updates.minimumAvailability !== 'undefined' && {
          minimum_availability: this.normaliseMinimumAvailability(
            updates.minimumAvailability,
          ),
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

  this.log.info(`Radarr instance ${id} updated`)
}

/**
 * Cleans up references to a deleted Radarr instance
 *
 * @param deletedId - ID of the deleted Radarr instance
 * @param trx - Optional Knex transaction object
 * @returns Promise resolving to void when complete
 */
export async function cleanupDeletedRadarrInstanceReferences(
  this: DatabaseService,
  deletedId: number,
  trx?: Knex.Transaction,
): Promise<void> {
  try {
    // Use the provided transaction or the regular knex instance
    const queryBuilder = trx || this.knex

    // Clean up junction table references
    await queryBuilder('watchlist_radarr_instances')
      .where('radarr_instance_id', deletedId)
      .del()

    // Clean up synced_instances references in other instances
    const instances = await queryBuilder('radarr_instances').select(
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

          await queryBuilder('radarr_instances')
            .where('id', instance.id)
            .update({
              synced_instances: JSON.stringify(updatedInstances),
              updated_at: this.timestamp,
            })

          this.log.debug(
            `Removed deleted Radarr instance ${deletedId} from synced_instances of instance ${instance.id}`,
          )
        }
      } catch (parseError) {
        this.log.error(
          `Error parsing synced_instances for Radarr instance ${instance.id}:`,
          parseError,
        )
      }
    }

    this.log.info(
      `Cleaned up references for deleted Radarr instance ${deletedId}`,
    )
  } catch (error) {
    this.log.error(
      `Error cleaning up references to deleted Radarr instance ${deletedId}:`,
      error,
    )
    throw error
  }
}

/**
 * Deletes a Radarr instance and cleans up references to it
 *
 * @param id - ID of the Radarr instance to delete
 * @returns Promise resolving to void when complete
 */
export async function deleteRadarrInstance(
  this: DatabaseService,
  id: number,
): Promise<void> {
  try {
    // Check if this is a default instance before deleting
    const instanceToDelete = await this.knex('radarr_instances')
      .where('id', id)
      .first()

    if (!instanceToDelete) {
      this.log.warn(`Radarr instance ${id} not found for deletion`)
      return
    }

    const isDefault =
      instanceToDelete?.is_default === 1 ||
      instanceToDelete?.is_default === true

    // Use a transaction to ensure atomicity across all operations
    await this.knex.transaction(async (trx) => {
      // First clean up references to this instance with transaction
      await this.cleanupDeletedRadarrInstanceReferences(id, trx)

      // Delete the instance
      await trx('radarr_instances').where('id', id).delete()

      // If this was a default instance, set a new default if any instances remain
      if (isDefault) {
        const remainingInstances = await trx('radarr_instances')
          .where('is_enabled', true)
          .orderBy('id')
          .select('id')
          .first()

        if (remainingInstances) {
          await trx('radarr_instances')
            .where('id', remainingInstances.id)
            .update({
              is_default: true,
              updated_at: this.timestamp,
            })

          this.log.info(
            `Set Radarr instance ${remainingInstances.id} as new default after deleting instance ${id}`,
          )
        }
      }
    })

    this.log.info(`Deleted Radarr instance ${id} and cleaned up references`)
  } catch (error) {
    this.log.error(`Error deleting Radarr instance ${id}:`, error)
    throw error
  }
}

/**
 * Retrieves a Radarr instance by ID or name
 *
 * @param identifier - Instance ID (number) or name (string)
 * @returns Promise resolving to the Radarr instance if found, null otherwise
 */
export async function getRadarrInstanceByIdentifier(
  this: DatabaseService,
  identifier: string | number,
): Promise<RadarrInstance | null> {
  let instance: RadarrInstanceRow | undefined

  if (typeof identifier === 'number') {
    instance = await this.knex('radarr_instances')
      .where({ id: identifier })
      .first()
  } else {
    instance = await this.knex('radarr_instances')
      .where({ name: identifier })
      .first()
  }

  if (!instance) return null

  return {
    ...instance,
    id: instance.id,
    name: instance.name,
    baseUrl: instance.base_url,
    apiKey: instance.api_key,
    qualityProfile: instance.quality_profile,
    rootFolder: instance.root_folder,
    bypassIgnored: Boolean(instance.bypass_ignored),
    searchOnAdd: Boolean(instance.search_on_add ?? true),
    minimumAvailability: this.normaliseMinimumAvailability(
      instance.minimum_availability,
    ),
    tags: this.safeJsonParse<string[]>(
      instance.tags,
      [],
      'radarrInstance.tags',
    ),
    isDefault: Boolean(instance.is_default),
    syncedInstances: this.safeJsonParse<number[]>(
      instance.synced_instances,
      [],
      'radarrInstance.syncedInstances',
    ),
  }
}
