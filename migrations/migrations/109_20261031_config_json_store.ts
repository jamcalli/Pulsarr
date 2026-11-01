import type { Knex } from 'knex'
import { isPostgreSQL } from '../utils/clientDetection.js'

type DocumentValue =
  | string
  | number
  | boolean
  | null
  | DocumentValue[]
  | { [key: string]: DocumentValue }

const KEPT_COLUMNS = ['id', 'created_at', 'updated_at', 'settings']

const BOOLEAN_COLUMNS = [
  'skipFriendSync',
  'deleteMovie',
  'deleteEndedShow',
  'deleteContinuingShow',
  'deleteFiles',
  '_isReady',
  'respectUserSyncSetting',
  'enableApprise',
  'tagUsersInSonarr',
  'tagUsersInRadarr',
  'cleanupOrphanedTags',
  'enablePlexPlaylistProtection',
  'plexMobileEnabled',
  'deleteSyncNotifyOnlyOnDeletion',
  'newUserDefaultCanSync',
  'newUserDefaultRequiresApproval',
  'newUserDefaultMovieQuotaEnabled',
  'newUserDefaultMovieBypassApproval',
  'newUserDefaultShowQuotaEnabled',
  'newUserDefaultShowBypassApproval',
  'deleteSyncTrackedOnly',
  'deleteSyncCleanupApprovals',
  'skipIfExistsOnPlex',
  'watchlistCapNotifyUser',
  'notifyOnAvailability',
  'maintainerrEnabled',
]

const JSON_COLUMNS = [
  'plexTokens',
  'plexSessionMonitoring',
  'publicContentNotifications',
  'quotaSettings',
  'approvalExpiration',
  'plexLabelSync',
]

const DEAD_COLUMNS = [
  'dbPath',
  'cookieName',
  'cookieSecured',
  'closeGraceDelay',
  'rateLimitMax',
  'queueProcessDelaySeconds',
  'persistHistoricalTags',
]

const PG_ENUM_TYPES = [
  'log_level',
  'delete_sync_notify',
  'removed_tag_mode',
  'deletion_mode',
]

function parseJsonColumn(value: DocumentValue): DocumentValue {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function toDocumentValue(name: string, value: DocumentValue): DocumentValue {
  if (value === null) return null
  if (BOOLEAN_COLUMNS.includes(name)) return Boolean(value)
  if (JSON_COLUMNS.includes(name)) return parseJsonColumn(value)
  return value
}

export async function up(knex: Knex): Promise<void> {
  const isPg = isPostgreSQL(knex)

  await knex.schema.alterTable('configs', (table) => {
    if (isPg) table.jsonb('settings').nullable()
    else table.text('settings').nullable()
  })

  const columns = Object.keys(await knex('configs').columnInfo()).filter(
    (name) => !KEPT_COLUMNS.includes(name),
  )

  const row: Record<string, DocumentValue> | undefined = await knex('configs')
    .where({ id: 1 })
    .first()

  if (row) {
    const settings: Record<string, DocumentValue> = {}
    for (const name of columns) {
      if (DEAD_COLUMNS.includes(name)) continue
      const value = toDocumentValue(name, row[name] ?? null)
      if (value !== null) settings[name] = value
    }
    await knex('configs')
      .where({ id: 1 })
      .update({ settings: JSON.stringify(settings) })
  }

  await knex.schema.alterTable('configs', (table) => {
    for (const name of columns) table.dropColumn(name)
  })

  await knex.schema.alterTable('configs', (table) => {
    const settings = isPg ? table.jsonb('settings') : table.text('settings')
    settings.notNullable().defaultTo('{}').alter()
  })

  if (isPg) {
    for (const type of PG_ENUM_TYPES) {
      await knex.raw('DROP TYPE IF EXISTS ??', [type])
    }
  }
}

export async function down(_: Knex): Promise<void> {
  throw new Error(
    'Irreversible: restore the pre-upgrade database backup to roll back the config JSON store.',
  )
}
