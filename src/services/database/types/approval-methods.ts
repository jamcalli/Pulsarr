import type {
  ApprovalRequest,
  ApprovalStats,
  ApprovalStatus,
  CreateApprovalRequestData,
  UpdateApprovalRequestData,
  UserApprovalStats,
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
     * Gets the total count of approval history records with optional filtering
     * @param userId - Optional user ID to filter by
     * @param status - Optional status to filter by
     * @param contentType - Optional content type to filter by ('movie' or 'show')
     * @param triggeredBy - Optional trigger type to filter by
     * @returns Promise resolving to the total count of matching records
     */
    getApprovalHistoryCount(
      userId?: number,
      status?: ApprovalStatus,
      contentType?: 'movie' | 'show',
      triggeredBy?: import('@root/types/approval.types.js').ApprovalTrigger,
    ): Promise<number>

    /**
     * Gets pending approval requests that have expired
     * @returns Promise resolving to array of expired pending requests
     */
    getExpiredPendingRequests(): Promise<ApprovalRequest[]>

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

    /**
     * Gets approval requests by criteria (user ID, status, etc.)
     * @param criteria - Filter criteria for approval requests
     * @returns Promise resolving to array of matching approval requests
     */
    getApprovalRequestsByCriteria(criteria: {
      userId?: number
      status?: ApprovalStatus
      contentType?: 'movie' | 'show'
    }): Promise<ApprovalRequest[]>

    /**
     * Updates approval request user attribution (for reconciliation)
     * @param id - The approval request ID
     * @param userId - New user ID
     * @param approvalNotes - Notes about the attribution update
     * @returns Promise resolving to updated approval request or null if not found
     */
    updateApprovalRequestAttribution(
      id: number,
      userId: number,
      approvalNotes: string,
    ): Promise<ApprovalRequest | null>

    /**
     * Retrieves all unique content GUIDs from approved and auto-approved requests
     * Used by delete sync to filter tracked content
     * @returns Promise resolving to a Set of GUIDs
     */
    getTrackedContentGuids(): Promise<Set<string>>

    /**
     * Retrieves approval requests by matching content GUIDs and content type
     * Used by delete sync cleanup to find approval records for deleted content
     * @param guids - Set of content GUIDs to match against
     * @param contentType - Content type to match ('movie' or 'show')
     * @returns Promise resolving to array of matching approval requests
     */
    getApprovalRequestsByGuids(
      guids: Set<string>,
      contentType: 'movie' | 'show',
    ): Promise<ApprovalRequest[]>
  }
}
