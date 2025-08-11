import type { DatabaseService } from '@services/database.service.js'
import type { RadarrInstance } from '@root/types/radarr.types.js'
import type { RadarrInstanceRow } from '@root/types/database-rows.types.js'
import type { Knex } from 'knex'

/**
 * Converts a RadarrInstanceRow from the database into a RadarrInstance object, normalizing and parsing fields as needed.
 *
 * @param row - The database row representing a Radarr instance
 * @returns The corresponding RadarrInstance object
 */
function mapRowToRadarrInstance(
  this: DatabaseService,
  row: RadarrInstanceRow,
): RadarrInstance {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    apiKey: row.api_key,
    qualityProfile: row.quality_profile,
    rootFolder: row.root_folder,
    bypassIgnored: Boolean(row.bypass_ignored),
    searchOnAdd: row.search_on_add === null ? true : Boolean(row.search_on_add),
    minimumAvailability: this.normaliseMinimumAvailability(
      row.minimum_availability,
    ),
    tags: this.safeJsonParse(row.tags, [], 'radarr.tags'),
    isDefault: Boolean(row.is_default),
    syncedInstances: this.safeJsonParse(
      row.synced_instances,
      [],
      'radarr.synced_instances',
    ),
  }
}

/**
 * Retrieves all enabled Radarr instances from the database, ordered by name.
 *
 * @returns A promise that resolves to an array of enabled RadarrInstance objects.
 */
export async function getAllRadarrInstances(
  this: DatabaseService,
): Promise<RadarrInstance[]> {
  const instances = await this.knex('radarr_instances')
    .select('*')
    .where('is_enabled', true)
    .orderBy('name')

  return instances.map((instance) =>
    mapRowToRadarrInstance.call(this, instance),
  )
}

/**
 * Retrieves the enabled Radarr instance marked as default.
 *
 * @returns The default Radarr instance if found, or null if none is set as default and enabled.
 */
export async function getDefaultRadarrInstance(
  this: DatabaseService,
): Promise<RadarrInstance | null> {
  const instance = await this.knex('radarr_instances')
    .where({ is_default: true, is_enabled: true })
    .first()

  if (!instance) return null

  return mapRowToRadarrInstance.call(this, instance)
}

/**
 * Retrieves a Radarr instance by its unique ID.
 *
 * @param id - The unique identifier of the Radarr instance.
 * @returns The corresponding Radarr instance if found, or null if no instance exists with the given ID.
 */
export async function getRadarrInstance(
  this: DatabaseService,
  id: number,
): Promise<RadarrInstance | null> {
  const instance = await this.knex('radarr_instances').where({ id }).first()

  if (!instance) return null

  return mapRowToRadarrInstance.call(this, instance)
}

/**
 * Creates a new Radarr instance in the database and returns its ID.
 *
 * If the new instance is set as default, any existing default instance is unset. The instance is inserted with provided or default values, and relevant fields are normalized or serialized as needed.
 *
 * @param instance - The Radarr instance data to create, excluding the ID
 * @returns The ID of the newly created Radarr instance
 */
export async function createRadarrInstance(
  this: DatabaseService,
  instance: Omit<RadarrInstance, 'id'>,
): Promise<number> {
  return await this.knex.transaction(async (trx) => {
    if (instance.isDefault) {
      await trx('radarr_instances')
        .where('is_default', true)
        .update('is_default', false)
    }

    const result = await trx('radarr_instances')
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
        tags: Array.isArray(instance.tags)
          ? JSON.stringify(instance.tags)
          : instance.tags || JSON.stringify([]),
        is_default: instance.isDefault ?? false,
        is_enabled: true,
        synced_instances: Array.isArray(instance.syncedInstances)
          ? JSON.stringify(instance.syncedInstances)
          : instance.syncedInstances || JSON.stringify([]),
        created_at: this.timestamp,
        updated_at: this.timestamp,
      })
      .returning('id')

    const id = this.extractId(result)
    this.log.info(`Radarr instance created with ID: ${id}`)
    return id
  })
}

/**
 * Updates the specified Radarr instance with provided fields.
 *
 * If the API key is set to 'placeholder' and `isDefault` is not explicitly true, the instance is forced to remain the default. Only fields present in the `updates` object are modified.
 *
 * @param id - The ID of the Radarr instance to update
 * @param updates - Fields to update for the Radarr instance
 */
export async function updateRadarrInstance(
  this: DatabaseService,
  id: number,
  updates: Partial<RadarrInstance>,
): Promise<void> {
  const sanitized = { ...updates }
  if (sanitized.apiKey === 'placeholder' && sanitized.isDefault !== true) {
    sanitized.isDefault = true
    this.log.warn('Forced placeholder instance to remain default')
  }

  await this.knex.transaction(async (trx) => {
    await this.validateInstanceDefaultStatus(
      trx,
      'radarr_instances',
      id,
      sanitized.isDefault,
      'Radarr',
    )

    await trx('radarr_instances')
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
        ...(typeof sanitized.searchOnAdd !== 'undefined' && {
          search_on_add: sanitized.searchOnAdd,
        }),
        ...(typeof sanitized.minimumAvailability !== 'undefined' && {
          minimum_availability: this.normaliseMinimumAvailability(
            sanitized.minimumAvailability,
          ),
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

  this.log.info(`Radarr instance ${id} updated`)
}

/**
 * Removes all references to a deleted Radarr instance from related database tables and synced instance lists.
 *
 * Deletes entries in the `watchlist_radarr_instances` junction table and removes the deleted instance ID from the `synced_instances` arrays of all other Radarr instances.
 *
 * @param deletedId - The ID of the Radarr instance that was deleted
 * @param trx - Optional transaction to use for database operations
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
          { error: parseError },
          `Error parsing synced_instances for Radarr instance ${instance.id}`,
        )
      }
    }

    this.log.info(
      `Cleaned up references for deleted Radarr instance ${deletedId}`,
    )
  } catch (error) {
    this.log.error(
      { error },
      `Error cleaning up references to deleted Radarr instance ${deletedId}`,
    )
    throw error
  }
}

/**
 * Deletes a Radarr instance by ID and removes all related references from the database.
 *
 * If the deleted instance was the default, another enabled instance is promoted to default if available.
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
    this.log.error({ error }, `Error deleting Radarr instance ${id}:`)
    throw error
  }
}

/**
 * Retrieves a Radarr instance matching a transformed base URL identifier.
 *
 * Used for webhook routing, this function compares the provided identifier to a normalized version of each instance's base URL. Returns the matching Radarr instance or null if none is found.
 *
 * @param instanceId - The normalized base URL identifier to match against Radarr instances
 * @returns A promise resolving to the matching Radarr instance, or null if not found
 */
export async function getRadarrInstanceByIdentifier(
  this: DatabaseService,
  instanceId: string,
): Promise<RadarrInstance | null> {
  const instances = await this.knex('radarr_instances').select()

  for (const instance of instances) {
    const transformedBaseUrl = instance.base_url
      .replace(/https?:\/\//, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase()

    if (transformedBaseUrl === instanceId.toLowerCase()) {
      return mapRowToRadarrInstance.call(this, instance)
    }
  }

  return null
}
