import type { Knex } from 'knex'
import { isPostgreSQL } from '../utils/clientDetection.js'

type JsonColumn = string | string[]

interface TrackingRow {
  id: number
  content_guids: JsonColumn
  user_id: number | null
  content_type: string
  plex_rating_key: string
  labels_applied: JsonColumn
}

function parseArray(value: JsonColumn): string[] | null {
  let parsed: unknown = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!Array.isArray(parsed)) return null
  return parsed.filter((g): g is string => typeof g === 'string')
}

// Lockstep with normalizeGuid in src/utils/guid-handler.ts, keeps first-occurrence order
function normalizeGuids(value: JsonColumn): string[] | null {
  const guids = parseArray(value)
  if (guids === null) return null
  return [...new Set(guids.map((g) => g.replace('://', ':').toLowerCase()))]
}

function sameArray(a: JsonColumn, b: string[]): boolean {
  return JSON.stringify(parseArray(a)) === JSON.stringify(b)
}

async function normalizeWatchlistItems(knex: Knex): Promise<void> {
  const rows: Array<{ id: number; guids: JsonColumn | null }> = await knex(
    'watchlist_items',
  )
    .whereNotNull('guids')
    .select('id', 'guids')

  for (const row of rows) {
    if (row.guids === null) continue
    const normalized = normalizeGuids(row.guids)
    if (normalized === null || sameArray(row.guids, normalized)) continue
    await knex('watchlist_items')
      .where('id', row.id)
      .update({ guids: JSON.stringify(normalized) })
  }
}

async function normalizePlexLabelTracking(knex: Knex): Promise<void> {
  const rows: TrackingRow[] = await knex('plex_label_tracking')
    .orderBy('id')
    .select(
      'id',
      'content_guids',
      'user_id',
      'content_type',
      'plex_rating_key',
      'labels_applied',
    )

  const groups = new Map<string, TrackingRow[]>()
  for (const row of rows) {
    const guids = normalizeGuids(row.content_guids)
    if (guids === null) continue
    const key = JSON.stringify([
      guids,
      row.user_id ?? -1,
      row.content_type,
      row.plex_rating_key,
    ])
    groups.set(key, [...(groups.get(key) ?? []), row])
  }

  for (const group of groups.values()) {
    const keep = group[group.length - 1]
    const losers = group.slice(0, -1).map((row) => row.id)

    if (losers.length > 0) {
      const labels = [
        ...new Set(
          group.flatMap((row) => parseArray(row.labels_applied) ?? []),
        ),
      ].sort()
      const ids = group.map((row) => row.id)
      await knex('plex_label_tracking')
        .where('id', keep.id)
        .update({
          labels_applied: JSON.stringify(labels),
          synced_at: knex('plex_label_tracking')
            .whereIn('id', ids)
            .max('synced_at'),
        })
      await knex('plex_label_tracking').whereIn('id', losers).del()
    }

    const normalized = normalizeGuids(keep.content_guids)
    if (normalized !== null && !sameArray(keep.content_guids, normalized)) {
      await knex('plex_label_tracking')
        .where('id', keep.id)
        .update({ content_guids: JSON.stringify(normalized) })
    }
  }
}

interface DroppedIndex {
  name: string
  table: string
  columns: string[]
}

const SHARED: DroppedIndex[] = [
  {
    name: 'admin_users_email_username_index',
    table: 'admin_users',
    columns: ['email', 'username'],
  },
  {
    name: 'anime_ids_external_id_index',
    table: 'anime_ids',
    columns: ['external_id'],
  },
  { name: 'api_keys_key_index', table: 'api_keys', columns: ['key'] },
  {
    name: 'approval_requests_user_id_index',
    table: 'approval_requests',
    columns: ['user_id'],
  },
  { name: 'genres_name_index', table: 'genres', columns: ['name'] },
  {
    name: 'pending_label_syncs_watchlist_item_id_index',
    table: 'pending_label_syncs',
    columns: ['watchlist_item_id'],
  },
  {
    name: 'rolling_monitored_shows_sonarr_series_id_sonarr_instance_id_index',
    table: 'rolling_monitored_shows',
    columns: ['sonarr_series_id', 'sonarr_instance_id'],
  },
  { name: 'schedules_name_index', table: 'schedules', columns: ['name'] },
  { name: 'users_name_index', table: 'users', columns: ['name'] },
  {
    name: 'watchlist_exclusions_user_id_index',
    table: 'watchlist_exclusions',
    columns: ['user_id'],
  },
  {
    name: 'watchlist_items_user_id_key_index',
    table: 'watchlist_items',
    columns: ['user_id', 'key'],
  },
  {
    name: 'watchlist_items_user_id_index',
    table: 'watchlist_items',
    columns: ['user_id'],
  },
  {
    name: 'watchlist_status_history_watchlist_item_id_status_index',
    table: 'watchlist_status_history',
    columns: ['watchlist_item_id', 'status'],
  },
  {
    name: 'notifications_watchlist_item_id_index',
    table: 'notifications',
    columns: ['watchlist_item_id'],
  },
  {
    name: 'watchlist_radarr_instances_is_primary_index',
    table: 'watchlist_radarr_instances',
    columns: ['is_primary'],
  },
  {
    name: 'watchlist_radarr_instances_syncing_index',
    table: 'watchlist_radarr_instances',
    columns: ['syncing'],
  },
  {
    name: 'watchlist_sonarr_instances_is_primary_index',
    table: 'watchlist_sonarr_instances',
    columns: ['is_primary'],
  },
  {
    name: 'watchlist_sonarr_instances_syncing_index',
    table: 'watchlist_sonarr_instances',
    columns: ['syncing'],
  },
  // 044 built the table as user_quotas_new and the rename kept the index names
  {
    name: 'user_quotas_new_bypass_approval_index',
    table: 'user_quotas',
    columns: ['bypass_approval'],
  },
  {
    name: 'router_rules_always_require_approval_index',
    table: 'router_rules',
    columns: ['always_require_approval'],
  },
  {
    name: 'router_rules_bypass_user_quotas_index',
    table: 'router_rules',
    columns: ['bypass_user_quotas'],
  },
  {
    name: 'api_keys_is_active_index',
    table: 'api_keys',
    columns: ['is_active'],
  },
  { name: 'schedules_enabled_index', table: 'schedules', columns: ['enabled'] },
  {
    name: 'webhook_endpoints_enabled_index',
    table: 'webhook_endpoints',
    columns: ['enabled'],
  },
  {
    name: 'users_requires_approval_index',
    table: 'users',
    columns: ['requires_approval'],
  },
]

const SQLITE_ONLY: DroppedIndex[] = [
  {
    name: 'radarr_instances_is_default_index',
    table: 'radarr_instances',
    columns: ['is_default'],
  },
  {
    name: 'radarr_instances_is_enabled_index',
    table: 'radarr_instances',
    columns: ['is_enabled'],
  },
  {
    name: 'sonarr_instances_is_default_index',
    table: 'sonarr_instances',
    columns: ['is_default'],
  },
  {
    name: 'sonarr_instances_is_enabled_index',
    table: 'sonarr_instances',
    columns: ['is_enabled'],
  },
  {
    name: 'radarr_instances_name_index',
    table: 'radarr_instances',
    columns: ['name'],
  },
  {
    name: 'sonarr_instances_name_index',
    table: 'sonarr_instances',
    columns: ['name'],
  },
  {
    name: 'watchlist_radarr_instances_watchlist_id_radarr_instance_id_index',
    table: 'watchlist_radarr_instances',
    columns: ['watchlist_id', 'radarr_instance_id'],
  },
  {
    name: 'watchlist_sonarr_instances_watchlist_id_sonarr_instance_id_index',
    table: 'watchlist_sonarr_instances',
    columns: ['watchlist_id', 'sonarr_instance_id'],
  },
  // Postgres keeps its same-named GIN, which serves the guid containment lookups
  {
    name: 'watchlist_items_guids_index',
    table: 'watchlist_items',
    columns: ['guids'],
  },
]

const POSTGRES_ONLY: DroppedIndex[] = [
  {
    name: 'watchlist_radarr_instances_watchlist_id_index',
    table: 'watchlist_radarr_instances',
    columns: ['watchlist_id'],
  },
  {
    name: 'watchlist_sonarr_instances_watchlist_id_index',
    table: 'watchlist_sonarr_instances',
    columns: ['watchlist_id'],
  },
]

function droppedIndexes(knex: Knex): DroppedIndex[] {
  return [...SHARED, ...(isPostgreSQL(knex) ? POSTGRES_ONLY : SQLITE_ONLY)]
}

export async function up(knex: Knex): Promise<void> {
  for (const { name } of droppedIndexes(knex)) {
    await knex.raw('DROP INDEX IF EXISTS ??', [name])
  }

  await normalizeWatchlistItems(knex)
  await normalizePlexLabelTracking(knex)

  if (isPostgreSQL(knex)) {
    await knex.raw(
      'CREATE INDEX IF NOT EXISTS plex_label_tracking_content_guids_gin ON plex_label_tracking USING gin (content_guids)',
    )
  }
}

export async function down(knex: Knex): Promise<void> {
  if (isPostgreSQL(knex)) {
    await knex.raw('DROP INDEX IF EXISTS plex_label_tracking_content_guids_gin')
  }

  for (const { name, table, columns } of droppedIndexes(knex)) {
    await knex.schema.alterTable(table, (t) => {
      t.index(columns, name)
    })
  }
}
