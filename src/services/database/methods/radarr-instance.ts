import type { DatabaseService } from '@services/database.service.js'
import type { RadarrInstance } from '@root/types/radarr.types.js'
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

  const [id] = await this.knex('radarr_instances')
    .insert({
      name: instance.name || 'Default Radarr Instance',
      base_url: instance.baseUrl,
      api_key: instance.apiKey,
      quality_profile: instance.qualityProfile,
      root_folder: instance.rootFolder,
      bypass_ignored: instance.bypassIgnored || false,
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

  this.log.info(`Radarr instance created with ID: ${id}`)
  return id
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
  const knexInstance = trx || this.knex

  await knexInstance('watchlist_radarr_instances')
    .where('radarr_instance_id', deletedId)
    .del()

  const instances = await knexInstance('radarr_instances').select(
    'id',
    'synced_instances',
  )

  for (const instance of instances) {
    const syncedInstances = this.safeJsonParse<number[]>(
      instance.synced_instances,
      [],
      'radarrInstance.syncedInstances',
    )

    if (Array.isArray(syncedInstances) && syncedInstances.includes(deletedId)) {
      const updatedInstances = syncedInstances.filter((id) => id !== deletedId)

      await knexInstance('radarr_instances')
        .where('id', instance.id)
        .update({
          synced_instances: JSON.stringify(updatedInstances),
          updated_at: this.timestamp,
        })
    }
  }

  this.log.info(
    `Cleaned up references for deleted Radarr instance ${deletedId}`,
  )
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
  const instanceToDelete = await this.knex('radarr_instances')
    .where('id', id)
    .first()

  if (!instanceToDelete) {
    this.log.warn(`Radarr instance ${id} not found for deletion`)
    return
  }

  const isDefault = Boolean(instanceToDelete.is_default)

  await this.knex.transaction(async (trx) => {
    await this.cleanupDeletedRadarrInstanceReferences(id, trx)
    await trx('radarr_instances').where({ id }).del()

    if (isDefault) {
      const remainingInstance = await trx('radarr_instances')
        .where('is_enabled', true)
        .orderBy('id')
        .first()

      if (remainingInstance) {
        await trx('radarr_instances').where('id', remainingInstance.id).update({
          is_default: true,
          updated_at: this.timestamp,
        })

        this.log.info(
          `Set Radarr instance ${remainingInstance.id} as new default after deleting instance ${id}`,
        )
      }
    }
  })

  this.log.info(`Radarr instance ${id} deleted`)
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
  let instance:
    | {
        id: number
        name: string
        base_url: string
        api_key: string
        quality_profile: string | null
        root_folder: string | null
        bypass_ignored: boolean | number
        tags: string | null
        is_default: boolean | number
        synced_instances: string | null
        search_on_add: boolean | number | null
        minimum_availability: string | null
        is_enabled: boolean | number
        created_at: string | Date
        updated_at: string | Date
      }
    | undefined

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
