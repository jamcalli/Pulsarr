import type { SonarrSeriesType } from '@root/schemas/sonarr/series-type.schema.js'
import type { SonarrInstanceRow } from '@root/types/database-rows.types.js'
import type { SonarrInstance } from '@root/types/sonarr.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { parseJsonOr } from '@utils/json.js'
import { toBoolean } from '@utils/to-boolean.js'
import type { Knex } from 'knex'

function normaliseMonitorNewItems(
  value: string | undefined | null,
): 'all' | 'none' {
  if (value === undefined || value === null) {
    throw new Error('monitorNewItems must be provided (all|none)')
  }
  const normalized = value.toLowerCase()
  if (!['all', 'none'].includes(normalized)) {
    throw new Error(`Invalid monitorNewItems value: ${value}`)
  }
  return normalized as 'all' | 'none'
}

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
    searchOnAdd: toBoolean(row.search_on_add, true),
    createSeasonFolders: toBoolean(row.create_season_folders, false),
    tags: parseJsonOr(row.tags, [], this.log, 'sonarr.tags'),
    isDefault: Boolean(row.is_default),
    syncedInstances: parseJsonOr(
      row.synced_instances,
      [],
      this.log,
      'sonarr.synced_instances',
    ),
    seriesType: (row.series_type as SonarrSeriesType) || 'standard',
    skipDefaultRoutingWhenNoMatch: Boolean(
      row.skip_default_routing_when_no_match,
    ),
  }
}

/** Enabled instances only. */
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

export async function getSonarrInstance(
  this: DatabaseService,
  id: number,
): Promise<SonarrInstance | null> {
  const instance = await this.knex('sonarr_instances').where({ id }).first()

  if (!instance) return null

  return mapRowToSonarrInstance.call(this, instance)
}

async function insertSonarrInstanceRow(
  this: DatabaseService,
  trx: Knex.Transaction,
  instance: Omit<SonarrInstance, 'id'>,
): Promise<number> {
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
      monitor_new_items: normaliseMonitorNewItems(
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
      skip_default_routing_when_no_match:
        instance.skipDefaultRoutingWhenNoMatch ?? false,
      created_at: this.timestamp,
      updated_at: this.timestamp,
    })
    .returning('id')

  const id = this.extractId(result)
  this.log.debug(`Sonarr instance created with ID: ${id}`)
  return id
}

/** Unsets any existing default when the new instance is default. */
export async function createSonarrInstance(
  this: DatabaseService,
  instance: Omit<SonarrInstance, 'id'>,
): Promise<number> {
  return await this.knex.transaction((trx) =>
    insertSonarrInstanceRow.call(this, trx, instance),
  )
}

/** A placeholder API key forces the instance to stay default unless isDefault is explicitly true. */
export async function updateSonarrInstance(
  this: DatabaseService,
  id: number,
  updates: Partial<SonarrInstance>,
): Promise<void> {
  const sanitized = { ...updates }
  if (sanitized.apiKey === 'placeholder' && sanitized.isDefault !== true) {
    sanitized.isDefault = true
    this.log.warn('Forced placeholder instance to remain default')
  }

  await this.knex.transaction(async (trx) => {
    await this.validateInstanceDefaultStatus(
      trx,
      'sonarr_instances',
      id,
      sanitized.isDefault,
      'Sonarr',
    )

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
          monitor_new_items: normaliseMonitorNewItems(
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
        ...(typeof sanitized.skipDefaultRoutingWhenNoMatch !== 'undefined' && {
          skip_default_routing_when_no_match:
            sanitized.skipDefaultRoutingWhenNoMatch,
        }),
        updated_at: this.timestamp,
      })
  })

  this.log.debug(`Sonarr instance ${id} updated`)
}

/** Removes junction rows and drops the id from every other instance's synced_instances list. */
export async function cleanupDeletedSonarrInstanceReferences(
  this: DatabaseService,
  deletedId: number,
  trx?: Knex.Transaction,
): Promise<void> {
  try {
    const queryBuilder = trx || this.knex

    await queryBuilder('watchlist_sonarr_instances')
      .where('sonarr_instance_id', deletedId)
      .del()

    const instances = await queryBuilder('sonarr_instances').select(
      'id',
      'synced_instances',
    )

    for (const instance of instances) {
      try {
        const syncedInstances = parseJsonOr<number[]>(
          instance.synced_instances,
          [],
          this.log,
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

    this.log.debug(
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

/** Promotes the lowest-id enabled instance when the deleted one was default, and rethrows errors. */
export async function deleteSonarrInstance(
  this: DatabaseService,
  id: number,
): Promise<void> {
  try {
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

    await this.knex.transaction(async (trx) => {
      await this.cleanupDeletedSonarrInstanceReferences(id, trx)

      await trx('sonarr_instances').where('id', id).delete()

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

          this.log.debug(
            `Set Sonarr instance ${remainingInstances.id} as new default after deleting instance ${id}`,
          )
        }
      }
    })

    this.log.debug(`Deleted Sonarr instance ${id} and cleaned up references`)
  } catch (error) {
    this.log.error({ error }, `Error deleting Sonarr instance ${id}`)
    throw error
  }
}

/** Deletes the instance with every reference to it and inserts the replacement as default in one transaction, returning the new id. */
export async function replaceSonarrInstance(
  this: DatabaseService,
  id: number,
  replacement: Omit<SonarrInstance, 'id'>,
): Promise<number> {
  const newId = await this.knex.transaction(async (trx) => {
    await this.cleanupDeletedSonarrInstanceReferences(id, trx)
    await trx('sonarr_instances').where('id', id).delete()
    return insertSonarrInstanceRow.call(this, trx, {
      ...replacement,
      isDefault: true,
    })
  })
  this.log.debug(`Replaced Sonarr instance ${id} with instance ${newId}`)
  return newId
}

/** instanceId is the base URL lowercased with the protocol and every non-alphanumeric character stripped. */
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
