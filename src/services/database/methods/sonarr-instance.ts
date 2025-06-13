import type { DatabaseService } from '@services/database.service.js'
import type { SonarrInstance } from '@root/types/sonarr.types.js'
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
    .select('*')
    .where('enabled', true)
    .orderBy('name')

  return instances.map((instance) => ({
    ...instance,
    tags: this.safeJsonParse<string[]>(
      instance.tags,
      [],
      'sonarrInstance.tags',
    ),
    syncedInstances: this.safeJsonParse<number[]>(
      instance.syncedInstances,
      [],
      'sonarrInstance.syncedInstances',
    ),
    data: instance.data
      ? this.safeJsonParse(instance.data, {}, 'sonarrInstance.data')
      : undefined,
    isDefault: Boolean(instance.isDefault),
    bypassIgnored: Boolean(instance.bypassIgnored),
    searchOnAdd: Boolean(instance.searchOnAdd),
    createSeasonFolders: Boolean(instance.createSeasonFolders),
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
    .where({ isDefault: true, enabled: true })
    .first()

  if (!instance) return null

  return {
    ...instance,
    tags: this.safeJsonParse<string[]>(
      instance.tags,
      [],
      'sonarrInstance.tags',
    ),
    syncedInstances: this.safeJsonParse<number[]>(
      instance.syncedInstances,
      [],
      'sonarrInstance.syncedInstances',
    ),
    data: instance.data
      ? this.safeJsonParse(instance.data, {}, 'sonarrInstance.data')
      : undefined,
    isDefault: Boolean(instance.isDefault),
    bypassIgnored: Boolean(instance.bypassIgnored),
    searchOnAdd: Boolean(instance.searchOnAdd),
    createSeasonFolders: Boolean(instance.createSeasonFolders),
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
    ...instance,
    tags: this.safeJsonParse<string[]>(
      instance.tags,
      [],
      'sonarrInstance.tags',
    ),
    syncedInstances: this.safeJsonParse<number[]>(
      instance.syncedInstances,
      [],
      'sonarrInstance.syncedInstances',
    ),
    data: instance.data
      ? this.safeJsonParse(instance.data, {}, 'sonarrInstance.data')
      : undefined,
    isDefault: Boolean(instance.isDefault),
    bypassIgnored: Boolean(instance.bypassIgnored),
    searchOnAdd: Boolean(instance.searchOnAdd),
    createSeasonFolders: Boolean(instance.createSeasonFolders),
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
  const [id] = await this.knex('sonarr_instances')
    .insert({
      name: instance.name,
      baseUrl: instance.baseUrl,
      apiKey: instance.apiKey,
      qualityProfile: instance.qualityProfile,
      rootFolder: instance.rootFolder,
      bypassIgnored: instance.bypassIgnored || false,
      seasonMonitoring: instance.seasonMonitoring,
      monitorNewItems: instance.monitorNewItems || 'all',
      tags: JSON.stringify(instance.tags || []),
      isDefault: instance.isDefault || false,
      syncedInstances: JSON.stringify(instance.syncedInstances || []),
      searchOnAdd: instance.searchOnAdd || false,
      seriesType: instance.seriesType || 'standard',
      createSeasonFolders: instance.createSeasonFolders || false,
      data: instance.data ? JSON.stringify(instance.data) : null,
      enabled: true,
      created_at: this.timestamp,
      updated_at: this.timestamp,
    })
    .returning('id')

  this.log.info(`Sonarr instance created with ID: ${id}`)
  return id
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
  const updateData: Record<string, unknown> = {
    updated_at: this.timestamp,
  }

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      if (key === 'tags' || key === 'syncedInstances' || key === 'data') {
        updateData[key] = value !== undefined ? JSON.stringify(value) : null
      } else {
        updateData[key] = value
      }
    }
  }

  await this.knex('sonarr_instances').where({ id }).update(updateData)
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
  const knexInstance = trx || this.knex

  await knexInstance('watchlist_sonarr_instances')
    .where('sonarr_instance_id', deletedId)
    .del()

  await knexInstance('sonarr_genre_routes')
    .where('sonarrInstanceId', deletedId)
    .del()

  this.log.info(
    `Cleaned up references for deleted Sonarr instance ${deletedId}`,
  )
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
  await this.knex.transaction(async (trx) => {
    await this.cleanupDeletedSonarrInstanceReferences(id, trx)
    await trx('sonarr_instances').where({ id }).del()
  })

  this.log.info(`Sonarr instance ${id} deleted`)
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
  let instance

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
    ...instance,
    tags: this.safeJsonParse<string[]>(
      instance.tags,
      [],
      'sonarrInstance.tags',
    ),
    syncedInstances: this.safeJsonParse<number[]>(
      instance.syncedInstances,
      [],
      'sonarrInstance.syncedInstances',
    ),
    data: instance.data
      ? this.safeJsonParse(instance.data, {}, 'sonarrInstance.data')
      : undefined,
    isDefault: Boolean(instance.isDefault),
    bypassIgnored: Boolean(instance.bypassIgnored),
    searchOnAdd: Boolean(instance.searchOnAdd),
    createSeasonFolders: Boolean(instance.createSeasonFolders),
  }
}
