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
    seasonMonitoring: instance.season_monitoring,
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
    seasonMonitoring: instance.season_monitoring,
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
    seasonMonitoring: instance.season_monitoring,
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
  const [id] = await this.knex('sonarr_instances')
    .insert({
      name: instance.name,
      base_url: instance.baseUrl,
      api_key: instance.apiKey,
      quality_profile: instance.qualityProfile,
      root_folder: instance.rootFolder,
      bypass_ignored: instance.bypassIgnored || false,
      season_monitoring: instance.seasonMonitoring,
      monitor_new_items: instance.monitorNewItems || 'all',
      tags: JSON.stringify(instance.tags || []),
      is_default: instance.isDefault || false,
      synced_instances: JSON.stringify(instance.syncedInstances || []),
      search_on_add: instance.searchOnAdd || false,
      series_type: instance.seriesType || 'standard',
      create_season_folders: instance.createSeasonFolders || false,
      data: instance.data ? JSON.stringify(instance.data) : null,
      is_enabled: true,
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
      switch (key) {
        case 'name':
          updateData.name = value
          break
        case 'baseUrl':
          updateData.base_url = value
          break
        case 'apiKey':
          updateData.api_key = value
          break
        case 'qualityProfile':
          updateData.quality_profile = value
          break
        case 'rootFolder':
          updateData.root_folder = value
          break
        case 'bypassIgnored':
          updateData.bypass_ignored = value
          break
        case 'seasonMonitoring':
          updateData.season_monitoring = value
          break
        case 'monitorNewItems':
          updateData.monitor_new_items = value
          break
        case 'searchOnAdd':
          updateData.search_on_add = value
          break
        case 'createSeasonFolders':
          updateData.create_season_folders = value
          break
        case 'tags':
          updateData.tags = JSON.stringify(value)
          break
        case 'isDefault':
          updateData.is_default = value
          break
        case 'syncedInstances':
          updateData.synced_instances = JSON.stringify(value)
          break
        case 'seriesType':
          updateData.series_type = value
          break
        case 'data':
          updateData.data = value ? JSON.stringify(value) : null
          break
        default:
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
  let instance:
    | {
        id: number
        name: string
        base_url: string
        api_key: string
        quality_profile: string | null
        root_folder: string | null
        bypass_ignored: boolean | number
        season_monitoring: string
        monitor_new_items: string | null
        search_on_add: boolean | number | null
        create_season_folders: boolean | number | null
        tags: string | null
        is_default: boolean | number
        synced_instances: string | null
        series_type: string | null
        is_enabled: boolean | number
        created_at: string | Date
        updated_at: string | Date
      }
    | undefined

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
    seasonMonitoring: instance.season_monitoring,
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
