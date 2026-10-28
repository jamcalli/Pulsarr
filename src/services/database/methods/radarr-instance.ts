import {
  type MinimumAvailability,
  RADARR_MINIMUM_AVAILABILITY_OPTIONS,
  type RadarrMonitorType,
} from '@root/schemas/radarr/add-options.schema.js'
import type { RadarrInstanceRow } from '@root/types/database-rows.types.js'
import type { RadarrInstance } from '@root/types/radarr.types.js'
import type { DatabaseService } from '@services/database.service.js'
import type { Knex } from 'knex'

/** Null or undefined becomes 'released', and an unknown value throws. */
function normaliseMinimumAvailability(
  value?: string | null,
): MinimumAvailability {
  if (value === undefined || value === null) {
    return 'released'
  }
  const v = value.toString().trim()
  const canonical = v.toLowerCase()
  const match = RADARR_MINIMUM_AVAILABILITY_OPTIONS.find(
    (allowedValue) => allowedValue.toLowerCase() === canonical,
  )
  if (!match) {
    throw new Error(`Invalid minimumAvailability value: ${v}`)
  }
  return match
}

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
    minimumAvailability: normaliseMinimumAvailability(row.minimum_availability),
    monitor: row.monitor as RadarrMonitorType,
    tags: this.safeJsonParse(row.tags, [], 'radarr.tags'),
    isDefault: Boolean(row.is_default),
    syncedInstances: this.safeJsonParse(
      row.synced_instances,
      [],
      'radarr.synced_instances',
    ),
    skipDefaultRoutingWhenNoMatch: Boolean(
      row.skip_default_routing_when_no_match,
    ),
  }
}

/** Enabled instances only. */
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

export async function getDefaultRadarrInstance(
  this: DatabaseService,
): Promise<RadarrInstance | null> {
  const instance = await this.knex('radarr_instances')
    .where({ is_default: true, is_enabled: true })
    .first()

  if (!instance) return null

  return mapRowToRadarrInstance.call(this, instance)
}

export async function getRadarrInstance(
  this: DatabaseService,
  id: number,
): Promise<RadarrInstance | null> {
  const instance = await this.knex('radarr_instances').where({ id }).first()

  if (!instance) return null

  return mapRowToRadarrInstance.call(this, instance)
}

async function insertRadarrInstanceRow(
  this: DatabaseService,
  trx: Knex.Transaction,
  instance: Omit<RadarrInstance, 'id'>,
): Promise<number> {
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
      minimum_availability: normaliseMinimumAvailability(
        instance.minimumAvailability,
      ),
      monitor: instance.monitor ?? 'movieOnly',
      tags: Array.isArray(instance.tags)
        ? JSON.stringify(instance.tags)
        : instance.tags || JSON.stringify([]),
      is_default: instance.isDefault ?? false,
      is_enabled: true,
      synced_instances: Array.isArray(instance.syncedInstances)
        ? JSON.stringify(instance.syncedInstances)
        : instance.syncedInstances || JSON.stringify([]),
      skip_default_routing_when_no_match:
        instance.skipDefaultRoutingWhenNoMatch ?? false,
      created_at: this.timestamp,
      updated_at: this.timestamp,
    })
    .returning('id')

  const id = this.extractId(result)
  this.log.debug(`Radarr instance created with ID: ${id}`)
  return id
}

/** Unsets any existing default when the new instance is default. */
export async function createRadarrInstance(
  this: DatabaseService,
  instance: Omit<RadarrInstance, 'id'>,
): Promise<number> {
  return await this.knex.transaction((trx) =>
    insertRadarrInstanceRow.call(this, trx, instance),
  )
}

/** A placeholder API key forces the instance to stay default unless isDefault is explicitly true. */
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
          minimum_availability: normaliseMinimumAvailability(
            sanitized.minimumAvailability,
          ),
        }),
        ...(typeof sanitized.monitor !== 'undefined' && {
          monitor: sanitized.monitor,
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

  this.log.debug(`Radarr instance ${id} updated`)
}

/** Removes junction rows and drops the id from every other instance's synced_instances list. */
export async function cleanupDeletedRadarrInstanceReferences(
  this: DatabaseService,
  deletedId: number,
  trx?: Knex.Transaction,
): Promise<void> {
  try {
    const queryBuilder = trx || this.knex

    await queryBuilder('watchlist_radarr_instances')
      .where('radarr_instance_id', deletedId)
      .del()

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

    this.log.debug(
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

/** Promotes the lowest-id enabled instance when the deleted one was default, and rethrows errors. */
export async function deleteRadarrInstance(
  this: DatabaseService,
  id: number,
): Promise<void> {
  try {
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

    await this.knex.transaction(async (trx) => {
      await this.cleanupDeletedRadarrInstanceReferences(id, trx)

      await trx('radarr_instances').where('id', id).delete()

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

          this.log.debug(
            `Set Radarr instance ${remainingInstances.id} as new default after deleting instance ${id}`,
          )
        }
      }
    })

    this.log.debug(`Deleted Radarr instance ${id} and cleaned up references`)
  } catch (error) {
    this.log.error({ error }, `Error deleting Radarr instance ${id}:`)
    throw error
  }
}

/** Deletes the instance with every reference to it and inserts the replacement as default in one transaction, returning the new id. */
export async function replaceRadarrInstance(
  this: DatabaseService,
  id: number,
  replacement: Omit<RadarrInstance, 'id'>,
): Promise<number> {
  const newId = await this.knex.transaction(async (trx) => {
    await this.cleanupDeletedRadarrInstanceReferences(id, trx)
    await trx('radarr_instances').where('id', id).delete()
    return insertRadarrInstanceRow.call(this, trx, {
      ...replacement,
      isDefault: true,
    })
  })
  this.log.debug(`Replaced Radarr instance ${id} with instance ${newId}`)
  return newId
}

/** instanceId is the base URL lowercased with the protocol and every non-alphanumeric character stripped. */
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
