import type { WatchlistStatus } from '@root/schemas/common/watchlist-status.schema.js'
import type {
  RecentRequestItem,
  RecentRequestStatus,
} from '@root/schemas/shared/recent-request.schema.js'
import type { DatabaseService } from '@services/database.service.js'
import { isStatusUpgrade } from '@utils/watchlist-status-rank.js'
import type { Knex } from 'knex'

function toJunctionStatus(status: string | null): WatchlistStatus {
  switch (status) {
    case 'requested':
      return 'requested'
    case 'grabbed':
      return 'grabbed'
    case 'notified':
      return 'notified'
    default:
      return 'pending'
  }
}

function getBestStatus(statuses: WatchlistStatus[]): WatchlistStatus {
  return statuses.reduce<WatchlistStatus>(
    (best, status) => (isStatusUpgrade(best, status) ? status : best),
    'pending',
  )
}

export async function getRecentRequests(
  this: DatabaseService,
  options: {
    limit?: number
    status?: RecentRequestStatus
    userId?: number
    includeUnrouted?: boolean
  },
): Promise<RecentRequestItem[]> {
  const { limit, status, userId, includeUnrouted = false } = options
  this.log.debug(
    { limit, status, userId, includeUnrouted },
    'Fetching recent requests for dashboard carousel',
  )

  try {
    const items: RecentRequestItem[] = []
    const pendingApprovalKeys = new Set<string>()

    // Only fetch approvals if not filtering to watchlist-only statuses
    const shouldFetchApprovals = !status || status === 'pending_approval'

    // Only fetch watchlist items if not filtering to approval-only status
    const shouldFetchWatchlist = !status || status !== 'pending_approval'

    // 1. Get pending approval requests
    if (shouldFetchApprovals) {
      const approvals = await this.knex('approval_requests')
        .select(
          'approval_requests.id',
          'approval_requests.content_title as title',
          'approval_requests.content_key as key',
          'approval_requests.content_type',
          'approval_requests.content_guids as guids',
          'approval_requests.user_id',
          'approval_requests.created_at',
          'users.name as user_name',
          'watchlist_items.thumb as thumb',
        )
        .leftJoin('users', 'approval_requests.user_id', 'users.id')
        .leftJoin('watchlist_items', function () {
          this.on('watchlist_items.user_id', 'approval_requests.user_id').andOn(
            'watchlist_items.key',
            'approval_requests.content_key',
          )
        })
        .where('approval_requests.status', 'pending')
        .modify((qb) => {
          if (userId !== undefined)
            qb.where('approval_requests.user_id', userId)
          if (limit !== undefined) qb.limit(limit)
        })
        .orderBy('approval_requests.created_at', 'desc')

      for (const row of approvals) {
        pendingApprovalKeys.add(`${row.user_id}:${row.key}`)
        items.push({
          id: row.id,
          source: 'approval',
          title: row.title,
          key: row.key,
          contentType: row.content_type as 'movie' | 'show',
          guids: this.safeJsonParse(row.guids, [], 'approval.guids'),
          thumb: row.thumb || null,
          status: 'pending_approval',
          userId: row.user_id,
          userName: row.user_name || 'Unknown',
          createdAt: row.created_at,
          statusTimes: { requested: null, grabbed: null, notified: null },
          primaryInstance: null,
          allInstances: [],
        })
      }
    }

    // 2. Get watchlist items with their instance info
    if (shouldFetchWatchlist) {
      const scopeWatchlistQuery =
        (type: 'movie' | 'show', junctionTable: string) =>
        (qb: Knex.QueryBuilder) => {
          if (userId !== undefined) qb.where('wi.user_id', userId)
          if (limit === undefined) return
          const newestIds = this.knex('watchlist_items as newest')
            .select('newest.id')
            .where('newest.type', type)
            .modify((sub) => {
              if (userId !== undefined) sub.where('newest.user_id', userId)
              if (!includeUnrouted) {
                sub.whereExists((exists) => {
                  exists
                    .select(1)
                    .from(junctionTable)
                    .whereRaw(`${junctionTable}.watchlist_id = newest.id`)
                })
              }
            })
            .orderBy('newest.created_at', 'desc')
            .limit(limit)
          qb.whereIn('wi.id', newestIds)
        }
      const requireRouting =
        (instanceColumn: string) => (qb: Knex.QueryBuilder) => {
          if (!includeUnrouted) qb.whereNotNull(instanceColumn)
        }
      const withStatusTimes = (qb: Knex.QueryBuilder) => {
        for (const [alias, status] of [
          ['hr', 'requested'],
          ['hg', 'grabbed'],
          ['hn', 'notified'],
        ] as const) {
          qb.leftJoin(`watchlist_status_history as ${alias}`, function () {
            this.on(`${alias}.watchlist_item_id`, '=', 'wi.id').andOnVal(
              `${alias}.status`,
              '=',
              status,
            )
          }).select(`${alias}.timestamp as ${status}_at`)
        }
      }

      // Fetch watchlist items for movies (Radarr)
      const radarrItems = await this.knex('watchlist_items as wi')
        .select(
          'wi.id',
          'wi.title',
          'wi.key',
          'wi.type as content_type',
          'wi.guids',
          'wi.thumb',
          'wi.user_id',
          'wi.created_at',
          'users.name as user_name',
          'wri.radarr_instance_id as instance_id',
          'wri.status as junction_status',
          'wri.is_primary',
          'ri.name as instance_name',
        )
        .leftJoin('users', 'wi.user_id', 'users.id')
        .leftJoin(
          'watchlist_radarr_instances as wri',
          'wri.watchlist_id',
          'wi.id',
        )
        .leftJoin('radarr_instances as ri', 'ri.id', 'wri.radarr_instance_id')
        .where('wi.type', 'movie')
        .modify(requireRouting('wri.radarr_instance_id'))
        .modify(scopeWatchlistQuery('movie', 'watchlist_radarr_instances'))
        .modify(withStatusTimes)
        .orderBy('wi.created_at', 'desc')

      // Fetch watchlist items for shows (Sonarr)
      const sonarrItems = await this.knex('watchlist_items as wi')
        .select(
          'wi.id',
          'wi.title',
          'wi.key',
          'wi.type as content_type',
          'wi.guids',
          'wi.thumb',
          'wi.user_id',
          'wi.created_at',
          'users.name as user_name',
          'wsi.sonarr_instance_id as instance_id',
          'wsi.status as junction_status',
          'wsi.is_primary',
          'si.name as instance_name',
        )
        .leftJoin('users', 'wi.user_id', 'users.id')
        .leftJoin(
          'watchlist_sonarr_instances as wsi',
          'wsi.watchlist_id',
          'wi.id',
        )
        .leftJoin('sonarr_instances as si', 'si.id', 'wsi.sonarr_instance_id')
        .where('wi.type', 'show')
        .modify(requireRouting('wsi.sonarr_instance_id'))
        .modify(scopeWatchlistQuery('show', 'watchlist_sonarr_instances'))
        .modify(withStatusTimes)
        .orderBy('wi.created_at', 'desc')

      // Group instances by watchlist item ID
      const watchlistItemsMap = new Map<
        number,
        {
          id: number
          title: string
          key: string
          contentType: 'movie' | 'show'
          guids: string[]
          thumb: string | null
          userId: number
          userName: string
          createdAt: string
          statusTimes: RecentRequestItem['statusTimes']
          instanceType: 'radarr' | 'sonarr'
          instances: Array<{
            id: number
            name: string
            status: string
            isPrimary: boolean
          }>
        }
      >()

      const rowsByInstanceType = [
        ['radarr', radarrItems],
        ['sonarr', sonarrItems],
      ] as const
      for (const [instanceType, rows] of rowsByInstanceType) {
        for (const row of rows) {
          if (
            includeUnrouted &&
            pendingApprovalKeys.has(`${row.user_id}:${row.key}`)
          ) {
            continue
          }
          let entry = watchlistItemsMap.get(row.id)
          if (!entry) {
            entry = {
              id: row.id,
              title: row.title,
              key: row.key,
              contentType: row.content_type as 'movie' | 'show',
              guids: this.safeJsonParse(row.guids, [], 'watchlist_item.guids'),
              thumb: row.thumb || null,
              userId: row.user_id,
              userName: row.user_name || 'Unknown',
              createdAt: row.created_at,
              statusTimes: {
                requested: row.requested_at ?? null,
                grabbed: row.grabbed_at ?? null,
                notified: row.notified_at ?? null,
              },
              instanceType,
              instances: [],
            }
            watchlistItemsMap.set(row.id, entry)
          }
          if (row.instance_id === null) continue
          entry.instances.push({
            id: row.instance_id,
            name: row.instance_name || 'Unknown',
            status: row.junction_status || 'pending',
            isPrimary: Boolean(row.is_primary),
          })
        }
      }

      // Convert map to array and build RecentRequestItem objects
      for (const item of watchlistItemsMap.values()) {
        // Find primary instance or use first
        const primaryInstance =
          item.instances.find((i) => i.isPrimary) || item.instances[0]

        // Map all instances to the response format
        const allInstances = item.instances.map((i) => ({
          id: i.id,
          name: i.name,
          instanceType: item.instanceType,
          junctionStatus: toJunctionStatus(i.status),
        }))

        // Determine the best status across all instances
        const bestStatus = getBestStatus(
          item.instances.map((i) => toJunctionStatus(i.status)),
        )

        // Apply status filter if provided
        if (status && bestStatus !== status) {
          continue
        }

        items.push({
          id: item.id,
          source: 'watchlist',
          title: item.title,
          key: item.key,
          contentType: item.contentType,
          guids: item.guids,
          thumb: item.thumb,
          status: bestStatus,
          userId: item.userId,
          userName: item.userName,
          createdAt: item.createdAt,
          statusTimes: item.statusTimes,
          primaryInstance: primaryInstance
            ? {
                id: primaryInstance.id,
                name: primaryInstance.name,
                instanceType: item.instanceType,
                junctionStatus: toJunctionStatus(primaryInstance.status),
              }
            : null,
          allInstances,
        })
      }
    }

    // Sort all items by createdAt descending and limit
    items.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )

    const result = limit === undefined ? items : items.slice(0, limit)

    this.log.debug(
      {
        totalItems: result.length,
        approvalCount: result.filter((i) => i.source === 'approval').length,
        watchlistCount: result.filter((i) => i.source === 'watchlist').length,
      },
      'Retrieved recent requests for dashboard',
    )

    return result
  } catch (error) {
    this.log.error({ error }, 'Error fetching recent requests for dashboard')
    throw error
  }
}
