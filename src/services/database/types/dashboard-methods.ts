import type {
  RecentRequestItem,
  RecentRequestStatus,
} from '@root/schemas/shared/recent-request.schema.js'

declare module '@services/database.service.js' {
  interface DatabaseService {
    /** An undefined limit returns every match, userId scopes approvals and watchlist rows, and includeUnrouted adds unrouted items as pending with no instances, deduped against pending approvals. */
    getRecentRequests(options: {
      limit?: number
      status?: RecentRequestStatus
      userId?: number
      includeUnrouted?: boolean
    }): Promise<RecentRequestItem[]>
  }
}
