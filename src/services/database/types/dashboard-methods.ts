import type {
  RecentRequestItem,
  RecentRequestStatus,
} from '@root/schemas/dashboard/recent-requests.schema.js'

declare module '@services/database.service.js' {
  interface DatabaseService {
    /**
     * Gets recent requests for the dashboard carousel
     * Combines pending approvals and routed watchlist items
     * @param limit - Maximum number of items to return (default: 10)
     * @param status - Optional status filter
     * @returns Promise resolving to array of recent request items
     */
    getRecentRequests(
      limit?: number,
      status?: RecentRequestStatus,
    ): Promise<RecentRequestItem[]>
  }
}
