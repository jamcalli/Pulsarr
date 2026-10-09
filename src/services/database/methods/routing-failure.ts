import {
  LOW_SEVERITY_ROUTING_FAILURES,
  ROUTING_FAILURE_CATEGORIES,
  type RoutingFailure,
  type RoutingFailureCategory,
  type RoutingFailureFilters,
  type RoutingFailureInput,
  type RoutingFailureSummary,
  routingFailureKey,
} from '@root/types/routing-failure.types.js'
import type { DatabaseService } from '@services/database.service.js'

const ITEM_LEVEL_INSTANCE_ID = 0

/**
 * Replaces the failures recorded for a user's watchlist item with the outcome
 * of its latest routing attempt. Failures that recur keep their first time and
 * count another attempt; failures that did not recur are dropped, so an empty
 * list clears the item.
 *
 * @returns False when the user has no watchlist row for the key
 */
export async function setRoutingFailures(
  this: DatabaseService,
  userId: number,
  key: string,
  failures: RoutingFailureInput[],
): Promise<boolean> {
  if (failures.length === 0) {
    await this.clearRoutingFailures(userId, key)
    return true
  }

  // the last failure per instance wins when one attempt reports it twice
  const byInstance = new Map<number, RoutingFailureInput>()
  for (const failure of failures) {
    byInstance.set(failure.instanceId ?? ITEM_LEVEL_INSTANCE_ID, failure)
  }

  return await this.knex.transaction(async (trx) => {
    const item = await trx('watchlist_items')
      .where({ user_id: userId, key })
      .first('id')
    if (!item) return false

    const now = this.timestamp

    await trx('watchlist_routing_failures')
      .where('watchlist_item_id', item.id)
      .whereNotIn('instance_id', [...byInstance.keys()])
      .delete()

    for (const [instanceId, failure] of byInstance) {
      await trx('watchlist_routing_failures')
        .insert({
          watchlist_item_id: item.id,
          instance_id: instanceId,
          category: failure.category,
          message: failure.message,
          attempt_count: 1,
          first_failed_at: now,
          last_failed_at: now,
        })
        .onConflict(['watchlist_item_id', 'instance_id'])
        .merge({
          category: failure.category,
          message: failure.message,
          last_failed_at: now,
          attempt_count: trx.raw('?? + 1', [
            'watchlist_routing_failures.attempt_count',
          ]),
        })
    }

    return true
  })
}

/**
 * Removes every failure recorded for a user's watchlist item.
 *
 * @returns Number of rows deleted
 */
export async function clearRoutingFailures(
  this: DatabaseService,
  userId: number,
  key: string,
): Promise<number> {
  return await this.knex('watchlist_routing_failures')
    .whereIn(
      'watchlist_item_id',
      this.knex('watchlist_items').select('id').where({ user_id: userId, key }),
    )
    .delete()
}

/**
 * Returns `userId:key` for every watchlist item with a recorded failure, so a
 * sync run can skip the clear for the items that have none.
 */
export async function getRoutingFailureKeys(
  this: DatabaseService,
): Promise<Set<string>> {
  const rows = await this.knex('watchlist_routing_failures as f')
    .join('watchlist_items as w', 'w.id', 'f.watchlist_item_id')
    .distinct('w.user_id', 'w.key')

  return new Set(rows.map((row) => routingFailureKey(row.user_id, row.key)))
}

/**
 * Returns recorded failures joined with their item, user and instance,
 * most recent first.
 */
export async function getRoutingFailures(
  this: DatabaseService,
  filters: RoutingFailureFilters = {},
): Promise<RoutingFailure[]> {
  const query = this.knex('watchlist_routing_failures as f')
    .join('watchlist_items as w', 'w.id', 'f.watchlist_item_id')
    .join('users as u', 'u.id', 'w.user_id')
    .leftJoin('radarr_instances as r', function () {
      this.on('r.id', '=', 'f.instance_id').andOnVal('w.type', '=', 'movie')
    })
    .leftJoin('sonarr_instances as s', function () {
      this.on('s.id', '=', 'f.instance_id').andOnVal('w.type', '=', 'show')
    })
    .select(
      'f.id',
      'f.watchlist_item_id',
      'f.instance_id',
      'f.category',
      'f.message',
      'f.attempt_count',
      'f.first_failed_at',
      'f.last_failed_at',
      'w.user_id',
      'w.key',
      'w.title',
      'w.type',
      'w.thumb',
      'u.name as username',
      'r.name as radarr_name',
      's.name as sonarr_name',
    )
    .orderBy('f.last_failed_at', 'desc')
    .orderBy('f.id', 'desc')

  if (filters.userId !== undefined) {
    query.where('w.user_id', filters.userId)
  }
  if (filters.category !== undefined) {
    query.where('f.category', filters.category)
  }

  const rows = await query

  return rows.map((row) => {
    const instanceId = Number(row.instance_id)
    const hasInstance = instanceId !== ITEM_LEVEL_INSTANCE_ID
    return {
      id: row.id,
      watchlist_item_id: row.watchlist_item_id,
      user_id: row.user_id,
      username: row.username,
      key: row.key,
      title: row.title,
      type: row.type,
      thumb: row.thumb ?? null,
      instance_type: hasInstance
        ? row.type === 'movie'
          ? 'radarr'
          : 'sonarr'
        : null,
      instance_id: hasInstance ? instanceId : null,
      instance_name: hasInstance
        ? (row.radarr_name ?? row.sonarr_name ?? null)
        : null,
      category: row.category,
      message: row.message,
      first_failed_at: new Date(row.first_failed_at).toISOString(),
      last_failed_at: new Date(row.last_failed_at).toISOString(),
      attempt_count: Number(row.attempt_count),
    }
  })
}

/**
 * Counts failed watchlist items overall, per category and per user. An item
 * counts once however many instances it failed on, and is actionable when any
 * of its failures is not low severity.
 */
export async function getRoutingFailureSummary(
  this: DatabaseService,
): Promise<RoutingFailureSummary> {
  const rows = await this.knex('watchlist_routing_failures as f')
    .join('watchlist_items as w', 'w.id', 'f.watchlist_item_id')
    .distinct('f.watchlist_item_id', 'f.category', 'w.user_id')

  const categoriesByItem = new Map<
    number,
    { userId: number; categories: Set<RoutingFailureCategory> }
  >()
  for (const row of rows) {
    const entry = categoriesByItem.get(row.watchlist_item_id) ?? {
      userId: row.user_id,
      categories: new Set<RoutingFailureCategory>(),
    }
    entry.categories.add(row.category)
    categoriesByItem.set(row.watchlist_item_id, entry)
  }

  const byCategory = Object.fromEntries(
    ROUTING_FAILURE_CATEGORIES.map((category) => [category, 0]),
  ) as Record<RoutingFailureCategory, number>
  const byUser = new Map<number, { total: number; actionable: number }>()
  let actionable = 0

  for (const { userId, categories } of categoriesByItem.values()) {
    const isActionable = [...categories].some(
      (category) => !LOW_SEVERITY_ROUTING_FAILURES.has(category),
    )
    for (const category of categories) {
      if (category in byCategory) byCategory[category]++
    }
    const user = byUser.get(userId) ?? { total: 0, actionable: 0 }
    user.total++
    if (isActionable) {
      user.actionable++
      actionable++
    }
    byUser.set(userId, user)
  }

  return {
    total: categoriesByItem.size,
    actionable,
    byCategory,
    byUser: [...byUser.entries()]
      .map(([userId, counts]) => ({ userId, ...counts }))
      .sort((a, b) => a.userId - b.userId),
  }
}

/**
 * Returns the ids of watchlist items with a recorded failure matching the
 * filters. Without a category, items whose only failures are low severity are
 * left out, because retrying them cannot succeed.
 */
export async function getRoutingFailureItemIds(
  this: DatabaseService,
  filters: RoutingFailureFilters = {},
): Promise<number[]> {
  const query = this.knex('watchlist_routing_failures as f')
    .join('watchlist_items as w', 'w.id', 'f.watchlist_item_id')
    .distinct('f.watchlist_item_id')
    .orderBy('f.watchlist_item_id')

  if (filters.userId !== undefined) {
    query.where('w.user_id', filters.userId)
  }
  if (filters.category !== undefined) {
    query.where('f.category', filters.category)
  } else {
    query.whereNotIn('f.category', [...LOW_SEVERITY_ROUTING_FAILURES])
  }

  const rows = await query
  return rows.map((row) => row.watchlist_item_id)
}

/**
 * Returns whether a watchlist item currently has any recorded failure.
 */
export async function hasRoutingFailures(
  this: DatabaseService,
  watchlistItemId: number,
): Promise<boolean> {
  const row = await this.knex('watchlist_routing_failures')
    .where('watchlist_item_id', watchlistItemId)
    .first('id')
  return row !== undefined
}
