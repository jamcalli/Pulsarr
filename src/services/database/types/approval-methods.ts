import type {
  ApprovalRequest,
  CreateApprovalRequestData,
  UpdateApprovalRequestData,
  ApprovalStats,
  UserApprovalStats,
  ApprovalStatus,
} from '@root/types/approval.types.js'

declare module '@services/database.service.js' {
  interface DatabaseService {
    // APPROVAL REQUEST MANAGEMENT
    /**
     * Creates a new approval request in the database
     * @param data - Approval request data
     * @returns Promise resolving to the created approval request
     */
    createApprovalRequest(
      data: CreateApprovalRequestData,
    ): Promise<ApprovalRequest>

    /**
     * Retrieves an approval request by ID
     * @param id - Approval request ID
     * @returns Promise resolving to the approval request if found, null otherwise
     */
    getApprovalRequest(id: number): Promise<ApprovalRequest | null>

    /**
     * Retrieves an approval request by user and content key
     * @param userId - User ID
     * @param contentKey - Content key (Plex key)
     * @returns Promise resolving to the approval request if found, null otherwise
     */
    getApprovalRequestByContent(
      userId: number,
      contentKey: string,
    ): Promise<ApprovalRequest | null>

    /**
     * Updates an approval request
     * @param id - Approval request ID
     * @param data - Update data
     * @returns Promise resolving to the updated approval request if found, null otherwise
     */
    updateApprovalRequest(
      id: number,
      data: UpdateApprovalRequestData,
    ): Promise<ApprovalRequest | null>

    /**
     * Approves an approval request
     * @param id - Approval request ID
     * @param approvedBy - Admin user ID who approved the request
     * @param notes - Optional approval notes
     * @returns Promise resolving to the updated approval request if found, null otherwise
     */
    approveRequest(
      id: number,
      approvedBy: number,
      notes?: string,
    ): Promise<ApprovalRequest | null>

    /**
     * Rejects an approval request
     * @param id - Approval request ID
     * @param rejectedBy - Admin user ID who rejected the request
     * @param reason - Optional rejection reason
     * @returns Promise resolving to the updated approval request if found, null otherwise
     */
    rejectRequest(
      id: number,
      rejectedBy: number,
      reason?: string,
    ): Promise<ApprovalRequest | null>

    /**
     * Deletes an approval request permanently from the database
     * @param id - Approval request ID
     * @returns Promise resolving to true if deleted, false if not found
     */
    deleteApprovalRequest(id: number): Promise<boolean>

    /**
     * Creates an approval request, handling expired duplicates atomically
     * @param data - Approval request data
     * @returns Promise resolving to the created or existing approval request with creation status
     */
    createApprovalRequestWithExpiredHandling(
      data: CreateApprovalRequestData,
    ): Promise<{ request: ApprovalRequest; isNewlyCreated: boolean }>

    /**
     * Gets pending approval requests with optional filtering and pagination
     * @param userId - Optional user ID to filter by
     * @param limit - Maximum number of results (default: 50)
     * @param offset - Number of results to skip (default: 0)
     * @returns Promise resolving to array of pending approval requests
     */
    getPendingApprovalRequests(
      userId?: number,
      limit?: number,
      offset?: number,
    ): Promise<ApprovalRequest[]>

    /**
     * Gets approval history with optional filtering and pagination
     * @param userId - Optional user ID to filter by
     * @param status - Optional status to filter by
     * @param limit - Maximum number of results (default: 50)
     * @param offset - Number of results to skip (default: 0)
     * @param contentType - Optional content type to filter by ('movie' or 'show')
     * @param triggeredBy - Optional trigger type to filter by
     * @returns Promise resolving to array of approval requests
     */
    getApprovalHistory(
      userId?: number,
      status?: ApprovalStatus,
      limit?: number,
      offset?: number,
      contentType?: 'movie' | 'show',
      triggeredBy?: import('@root/types/approval.types.js').ApprovalTrigger,
    ): Promise<ApprovalRequest[]>

    /**
     * Gets overall approval statistics
     * @returns Promise resolving to approval statistics
     */
    getApprovalStats(): Promise<ApprovalStats>

    /**
     * Gets approval statistics for a specific user
     * @param userId - User ID
     * @returns Promise resolving to user approval statistics
     */
    getUserApprovalStats(userId: number): Promise<UserApprovalStats>

    /**
     * Expires old pending requests based on their expires_at timestamp
     * @returns Promise resolving to the number of expired requests
     */
    expireOldRequests(): Promise<number>

    /**
     * Cleans up old expired requests
     * @param olderThanDays - Delete expired requests older than this many days (default: 30)
     * @returns Promise resolving to the number of deleted requests
     */
    cleanupExpiredRequests(olderThanDays?: number): Promise<number>
  }
}
