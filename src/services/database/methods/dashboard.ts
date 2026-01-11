import type { RecentRequestItem } from '@root/schemas/dashboard/recent-requests.schema.js'
import type { DatabaseService } from '@services/database.service.js'

/**
 * Maps junction status to display status
 * Both 'grabbed' and 'notified' are treated as 'available' since
 * junction status is only updated on webhook confirmation.
 */
function mapJunctionStatus(
  status: string | null,
): 'pending' | 'requested' | 'available' {
  switch (status) {
    case 'notified':
    case 'grabbed':
      return 'available'
    case 'requested':
      return 'requested'
    default:
      return 'pending'
  }
}

/**
 * Determines the "best" status across all instances
 * Priority: available > requested > pending
 */
function getBestStatus(
  instances: Array<{ status: string }>,
): 'pending' | 'requested' | 'available' {
  const statusPriority = {
    available: 3,
    requested: 2,
    pending: 1,
  }

  let bestStatus: 'pending' | 'requested' | 'available' = 'pending'
  let bestPriority = 0

  for (const instance of instances) {
    const mappedStatus = mapJunctionStatus(instance.status)
    const priority = statusPriority[mappedStatus]
    if (priority > bestPriority) {
      bestPriority = priority
      bestStatus = mappedStatus
    }
  }

  return bestStatus
}

/**
 * Gets recent requests for the dashboard carousel.
 * Combines pending approvals and routed watchlist items.
 *
 * @param limit - Maximum number of items to return (default: 10)
 * @param status - Optional status filter
 * @returns Promise resolving to array of recent request items
 */
export async function getRecentRequests(
  this: DatabaseService,
  limit = 10,
  status?: 'pending_approval' | 'pending' | 'requested' | 'available',
): Promise<RecentRequestItem[]> {
  this.log.debug(
    { limit, status },
    'Fetching recent requests for dashboard carousel',
  )

  try {
    const items: RecentRequestItem[] = []

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
          'approval_requests.content_type',
          'approval_requests.content_guids as guids',
          'approval_requests.user_id',
          'approval_requests.created_at',
          'users.name as user_name',
        )
        .leftJoin('users', 'approval_requests.user_id', 'users.id')
        .where('approval_requests.status', 'pending')
        .orderBy('approval_requests.created_at', 'desc')
        .limit(limit)

      for (const row of approvals) {
        items.push({
          id: row.id,
          source: 'approval',
          title: row.title,
          contentType: row.content_type as 'movie' | 'show',
          guids: this.safeJsonParse(row.guids, [], 'approval.guids'),
          thumb: null, // Approvals don't store thumb
          status: 'pending_approval',
          userId: row.user_id,
          userName: row.user_name || 'Unknown',
          createdAt: row.created_at,
          primaryInstance: null,
          allInstances: [],
        })
      }
    }

    // 2. Get watchlist items with their instance info
    if (shouldFetchWatchlist) {
      // Fetch watchlist items for movies (Radarr)
      const radarrItems = await this.knex('watchlist_items as wi')
        .select(
          'wi.id',
          'wi.title',
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
        .whereNotNull('wri.radarr_instance_id')
        .orderBy('wi.created_at', 'desc')
        .limit(limit * 3) // Fetch more to account for multiple instances per item

      // Fetch watchlist items for shows (Sonarr)
      const sonarrItems = await this.knex('watchlist_items as wi')
        .select(
          'wi.id',
          'wi.title',
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
        .whereNotNull('wsi.sonarr_instance_id')
        .orderBy('wi.created_at', 'desc')
        .limit(limit * 3)

      // Group instances by watchlist item ID
      const watchlistItemsMap = new Map<
        number,
        {
          id: number
          title: string
          contentType: 'movie' | 'show'
          guids: string[]
          thumb: string | null
          userId: number
          userName: string
          createdAt: string
          instanceType: 'radarr' | 'sonarr'
          instances: Array<{
            id: number
            name: string
            status: string
            isPrimary: boolean
          }>
        }
      >()

      // Process Radarr items
      for (const row of radarrItems) {
        const existing = watchlistItemsMap.get(row.id)
        if (existing) {
          existing.instances.push({
            id: row.instance_id,
            name: row.instance_name || 'Unknown',
            status: row.junction_status || 'pending',
            isPrimary: Boolean(row.is_primary),
          })
        } else {
          watchlistItemsMap.set(row.id, {
            id: row.id,
            title: row.title,
            contentType: row.content_type as 'movie' | 'show',
            guids: this.safeJsonParse(row.guids, [], 'watchlist_item.guids'),
            thumb: row.thumb || null,
            userId: row.user_id,
            userName: row.user_name || 'Unknown',
            createdAt: row.created_at,
            instanceType: 'radarr',
            instances: [
              {
                id: row.instance_id,
                name: row.instance_name || 'Unknown',
                status: row.junction_status || 'pending',
                isPrimary: Boolean(row.is_primary),
              },
            ],
          })
        }
      }

      // Process Sonarr items
      for (const row of sonarrItems) {
        const existing = watchlistItemsMap.get(row.id)
        if (existing) {
          existing.instances.push({
            id: row.instance_id,
            name: row.instance_name || 'Unknown',
            status: row.junction_status || 'pending',
            isPrimary: Boolean(row.is_primary),
          })
        } else {
          watchlistItemsMap.set(row.id, {
            id: row.id,
            title: row.title,
            contentType: row.content_type as 'movie' | 'show',
            guids: this.safeJsonParse(row.guids, [], 'watchlist_item.guids'),
            thumb: row.thumb || null,
            userId: row.user_id,
            userName: row.user_name || 'Unknown',
            createdAt: row.created_at,
            instanceType: 'sonarr',
            instances: [
              {
                id: row.instance_id,
                name: row.instance_name || 'Unknown',
                status: row.junction_status || 'pending',
                isPrimary: Boolean(row.is_primary),
              },
            ],
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
          status: mapJunctionStatus(i.status),
        }))

        // Determine the best status across all instances
        const bestStatus = getBestStatus(item.instances)

        // Apply status filter if provided
        if (status && bestStatus !== status) {
          continue
        }

        items.push({
          id: item.id,
          source: 'watchlist',
          title: item.title,
          contentType: item.contentType,
          guids: item.guids,
          thumb: item.thumb,
          status: bestStatus,
          userId: item.userId,
          userName: item.userName,
          createdAt: item.createdAt,
          primaryInstance: primaryInstance
            ? {
                id: primaryInstance.id,
                name: primaryInstance.name,
                instanceType: item.instanceType,
                status: mapJunctionStatus(primaryInstance.status),
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

    const result = items.slice(0, limit)

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
