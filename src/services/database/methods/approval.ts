import type { DatabaseService } from '@services/database.service.js'
import type {
  ApprovalRequest,
  ApprovalRequestRow,
  CreateApprovalRequestData,
  UpdateApprovalRequestData,
  ApprovalStats,
  UserApprovalStats,
  ApprovalStatus,
} from '@root/types/approval.types.js'

/**
 * Converts a database row into an ApprovalRequest object, parsing JSON fields and providing default values where necessary.
 *
 * @param this - DatabaseService instance for accessing safeJsonParse
 * @param row - The database row representing an approval request, optionally including the user's name
 * @returns The mapped ApprovalRequest object
 */
function mapRowToApprovalRequest(
  this: DatabaseService,
  row: ApprovalRequestRow & { user_name?: string },
): ApprovalRequest {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name || 'Unknown',
    contentType: row.content_type,
    contentTitle: row.content_title,
    contentKey: row.content_key,
    contentGuids: this.safeJsonParse(
      row.content_guids,
      [],
      'approval.content_guids',
    ),
    proposedRouterDecision: this.safeJsonParse(
      row.router_decision,
      { action: 'continue' as const },
      'approval.router_decision',
    ),
    routerRuleId: row.router_rule_id,
    triggeredBy: row.triggered_by,
    approvalReason: row.approval_reason,
    status: row.status,
    approvedBy: row.approved_by,
    approvalNotes: row.approval_notes,
    expiresAt: row.expires_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Inserts a new approval request into the database with the provided data and returns the created request.
 *
 * The returned approval request includes the associated user's name and all relevant fields.
 *
 * @param data - The data for the new approval request
 * @returns The created approval request object
 */
export async function createApprovalRequest(
  this: DatabaseService,
  data: CreateApprovalRequestData,
): Promise<ApprovalRequest> {
  const [row] = await this.knex('approval_requests')
    .insert({
      user_id: data.userId,
      content_type: data.contentType,
      content_title: data.contentTitle,
      content_key: data.contentKey,
      content_guids: JSON.stringify(data.contentGuids || []),
      router_decision: JSON.stringify(data.routerDecision),
      router_rule_id: data.routerRuleId,
      approval_reason: data.approvalReason,
      triggered_by: data.triggeredBy,
      expires_at: data.expiresAt,
      status: 'pending',
      created_at: this.timestamp,
      updated_at: this.timestamp,
    })
    .returning('*')

  // Get the inserted row with username
  const rowWithUsername = await this.knex('approval_requests')
    .select('approval_requests.*', 'users.name as user_name')
    .leftJoin('users', 'approval_requests.user_id', 'users.id')
    .where('approval_requests.id', row.id)
    .first()

  return mapRowToApprovalRequest.call(this, rowWithUsername)
}

/**
 * Retrieves an approval request by its unique ID, including the associated user's name.
 *
 * @param id - The unique identifier of the approval request
 * @returns The corresponding ApprovalRequest object, or null if not found
 */
export async function getApprovalRequest(
  this: DatabaseService,
  id: number,
): Promise<ApprovalRequest | null> {
  const row = await this.knex('approval_requests')
    .select('approval_requests.*', 'users.name as user_name')
    .leftJoin('users', 'approval_requests.user_id', 'users.id')
    .where('approval_requests.id', id)
    .first()
  return row ? mapRowToApprovalRequest.call(this, row) : null
}

/**
 * Retrieves an approval request for a specific user and content key.
 *
 * @param userId - The ID of the user associated with the approval request
 * @param contentKey - The unique key identifying the content
 * @returns The matching approval request, or null if not found
 */
export async function getApprovalRequestByContent(
  this: DatabaseService,
  userId: number,
  contentKey: string,
): Promise<ApprovalRequest | null> {
  const row = await this.knex('approval_requests')
    .select('approval_requests.*', 'users.name as user_name')
    .leftJoin('users', 'approval_requests.user_id', 'users.id')
    .where({
      'approval_requests.user_id': userId,
      'approval_requests.content_key': contentKey,
    })
    .first()
  return row ? mapRowToApprovalRequest.call(this, row) : null
}

/**
 * Updates fields of an approval request by ID and returns the updated request.
 *
 * Only the fields provided in the `data` parameter are updated. Returns the updated `ApprovalRequest` object, or `null` if no matching request is found.
 *
 * @param id - The ID of the approval request to update
 * @param data - The fields to update in the approval request
 * @returns The updated approval request, or `null` if not found
 */
export async function updateApprovalRequest(
  this: DatabaseService,
  id: number,
  data: UpdateApprovalRequestData,
): Promise<ApprovalRequest | null> {
  const updateData: Partial<ApprovalRequestRow> = {
    updated_at: this.timestamp,
  }

  if (data.status !== undefined) updateData.status = data.status
  if (data.approvedBy !== undefined) updateData.approved_by = data.approvedBy
  if (data.approvalNotes !== undefined)
    updateData.approval_notes = data.approvalNotes
  if (data.proposedRouterDecision !== undefined)
    updateData.router_decision = JSON.stringify(data.proposedRouterDecision)

  const [row] = await this.knex('approval_requests')
    .where('id', id)
    .update(updateData)
    .returning('*')

  if (!row) return null

  // Get the updated row with username
  const updatedRow = await this.knex('approval_requests')
    .select('approval_requests.*', 'users.name as user_name')
    .leftJoin('users', 'approval_requests.user_id', 'users.id')
    .where('approval_requests.id', id)
    .first()

  return updatedRow ? mapRowToApprovalRequest.call(this, updatedRow) : null
}

/**
 * Marks an approval request as approved, setting the approver and optional notes.
 *
 * @param id - The ID of the approval request to approve
 * @param approvedBy - The user ID of the approver
 * @param notes - Optional notes to include with the approval
 * @returns The updated approval request, or null if not found
 */
export async function approveRequest(
  this: DatabaseService,
  id: number,
  approvedBy: number,
  notes?: string,
): Promise<ApprovalRequest | null> {
  return this.updateApprovalRequest(id, {
    status: 'approved',
    approvedBy,
    approvalNotes: notes,
  })
}

/**
 * Marks an approval request as rejected, recording the rejecting user and optional reason.
 *
 * @param id - The ID of the approval request to reject
 * @param rejectedBy - The user ID of the person rejecting the request
 * @param reason - Optional reason for rejection
 * @returns The updated ApprovalRequest if found, or null if no matching request exists
 */
export async function rejectRequest(
  this: DatabaseService,
  id: number,
  rejectedBy: number,
  reason?: string,
): Promise<ApprovalRequest | null> {
  return this.updateApprovalRequest(id, {
    status: 'rejected',
    approvedBy: rejectedBy,
    approvalNotes: reason,
  })
}

/**
 * Retrieves pending approval requests, optionally filtered by user ID.
 *
 * @param userId - If provided, filters requests to those created by the specified user
 * @param limit - Maximum number of requests to return (default: 50)
 * @param offset - Number of requests to skip before starting to collect the result set (default: 0)
 * @returns An array of pending approval requests, ordered by creation date descending
 */
export async function getPendingApprovalRequests(
  this: DatabaseService,
  userId?: number,
  limit = 50,
  offset = 0,
): Promise<ApprovalRequest[]> {
  let query = this.knex('approval_requests')
    .select('approval_requests.*', 'users.name as user_name')
    .leftJoin('users', 'approval_requests.user_id', 'users.id')
    .where('approval_requests.status', 'pending')

  if (userId) {
    query = query.where('approval_requests.user_id', userId)
  }

  const rows = await query
    .orderBy('approval_requests.created_at', 'desc')
    .limit(limit)
    .offset(offset)

  return rows.map((row) => mapRowToApprovalRequest.call(this, row))
}

/**
 * Retrieves approval requests with optional filters for user, status, content type, and trigger source.
 *
 * @param userId - If provided, filters approval requests by user ID
 * @param status - If provided, filters approval requests by status
 * @param limit - Maximum number of results to return (default: 50)
 * @param offset - Number of results to skip (default: 0)
 * @param contentType - If provided, filters by content type ('movie' or 'show')
 * @param triggeredBy - If provided, filters by the source that triggered the approval request
 * @returns An array of approval requests matching the specified filters
 */
export async function getApprovalHistory(
  this: DatabaseService,
  userId?: number,
  status?: ApprovalStatus,
  limit = 50,
  offset = 0,
  contentType?: 'movie' | 'show',
  triggeredBy?: import('@root/types/approval.types.js').ApprovalTrigger,
): Promise<ApprovalRequest[]> {
  let query = this.knex('approval_requests')
    .select('approval_requests.*', 'users.name as user_name')
    .leftJoin('users', 'approval_requests.user_id', 'users.id')

  if (userId) {
    query = query.where('approval_requests.user_id', userId)
  }

  if (status) {
    query = query.where('approval_requests.status', status)
  }

  if (contentType) {
    query = query.where('approval_requests.content_type', contentType)
  }

  if (triggeredBy) {
    query = query.where('approval_requests.triggered_by', triggeredBy)
  }

  const rows = await query
    .orderBy('approval_requests.updated_at', 'desc')
    .limit(limit)
    .offset(offset)

  return rows.map((row) => mapRowToApprovalRequest.call(this, row))
}

/**
 * Returns the total number of approval requests matching the specified filters.
 *
 * @param userId - Optional user ID to filter approval requests by user
 * @param status - Optional approval status to filter results
 * @param contentType - Optional content type ('movie' or 'show') to filter results
 * @param triggeredBy - Optional trigger source to filter results
 * @returns The count of approval requests matching the provided criteria
 */
export async function getApprovalHistoryCount(
  this: DatabaseService,
  userId?: number,
  status?: ApprovalStatus,
  contentType?: 'movie' | 'show',
  triggeredBy?: import('@root/types/approval.types.js').ApprovalTrigger,
): Promise<number> {
  let query = this.knex('approval_requests')

  if (userId) {
    query = query.where('approval_requests.user_id', userId)
  }

  if (status) {
    query = query.where('approval_requests.status', status)
  }

  if (contentType) {
    query = query.where('approval_requests.content_type', contentType)
  }

  if (triggeredBy) {
    query = query.where('approval_requests.triggered_by', triggeredBy)
  }

  const result = await query.count('* as count').first()
  return Number.parseInt(String(result?.count), 10) || 0
}

/**
 * Retrieves all pending approval requests whose expiration date has passed.
 *
 * @returns An array of expired pending approval requests.
 */
export async function getExpiredPendingRequests(
  this: DatabaseService,
): Promise<ApprovalRequest[]> {
  const rows = await this.knex('approval_requests')
    .select('approval_requests.*', 'users.name as user_name')
    .leftJoin('users', 'approval_requests.user_id', 'users.id')
    .where('approval_requests.status', 'pending')
    .where('approval_requests.expires_at', '<', this.timestamp)
    .whereNotNull('approval_requests.expires_at')
    .orderBy('approval_requests.expires_at', 'asc')

  return rows.map((row) => mapRowToApprovalRequest.call(this, row))
}

/**
 * Retrieves aggregated counts of approval requests grouped by status and the total number of requests.
 *
 * @returns An object containing the count of requests for each status and the total number of requests.
 */
export async function getApprovalStats(
  this: DatabaseService,
): Promise<ApprovalStats> {
  const stats = await this.knex('approval_requests')
    .select('status')
    .count('* as count')
    .groupBy('status')

  const result: ApprovalStats = {
    pending: 0,
    approved: 0,
    rejected: 0,
    expired: 0,
    totalRequests: 0,
  }

  for (const stat of stats) {
    const count = Number.parseInt(String(stat.count), 10)
    result.totalRequests += count

    switch (stat.status as ApprovalStatus) {
      case 'pending':
        result.pending = count
        break
      case 'approved':
        result.approved = count
        break
      case 'rejected':
        result.rejected = count
        break
      case 'expired':
        result.expired = count
        break
    }
  }

  return result
}

/**
 * Retrieves approval statistics and quota information for a specific user.
 *
 * Returns an object containing the user's name, counts of approval requests by status, total requests, current quota usage, quota limit and type, and whether approval can be bypassed.
 *
 * @param userId - The ID of the user whose approval statistics are requested
 * @returns A `UserApprovalStats` object with user details, request counts, and quota information
 */
export async function getUserApprovalStats(
  this: DatabaseService,
  userId: number,
): Promise<UserApprovalStats> {
  const [userInfo, requestStats, quotaInfo] = await Promise.all([
    this.knex('users').select('name').where('id', userId).first(),
    this.knex('approval_requests')
      .select('status')
      .count('* as count')
      .where('user_id', userId)
      .groupBy('status'),
    this.knex('user_quotas').where('user_id', userId).first(),
  ])

  const stats = {
    userId,
    userName: userInfo?.name || 'Unknown',
    totalRequests: 0,
    approvedRequests: 0,
    rejectedRequests: 0,
    pendingRequests: 0,
    currentQuotaUsage: 0,
    quotaLimit: quotaInfo?.quota_limit || 0,
    quotaType: quotaInfo?.quota_type || 'monthly',
    bypassApproval: Boolean(quotaInfo?.bypass_approval),
  }

  for (const stat of requestStats) {
    const count = Number.parseInt(String(stat.count), 10)
    stats.totalRequests += count

    switch (stat.status as ApprovalStatus) {
      case 'approved':
        stats.approvedRequests = count
        break
      case 'rejected':
        stats.rejectedRequests = count
        break
      case 'pending':
        stats.pendingRequests = count
        break
    }
  }

  return stats
}

/**
 * Marks all pending approval requests with an expired `expires_at` timestamp as expired.
 *
 * @returns The number of approval requests updated.
 */
export async function expireOldRequests(
  this: DatabaseService,
): Promise<number> {
  const expiredCount = await this.knex('approval_requests')
    .where('status', 'pending')
    .where('expires_at', '<', this.timestamp)
    .update({
      status: 'expired',
      updated_at: this.timestamp,
    })

  return expiredCount
}

/**
 * Permanently deletes an approval request by its ID.
 *
 * @param id - The unique identifier of the approval request to delete
 * @returns `true` if the request was deleted, otherwise `false`
 */
export async function deleteApprovalRequest(
  this: DatabaseService,
  id: number,
): Promise<boolean> {
  const deletedCount = await this.knex('approval_requests')
    .where('id', id)
    .del()

  return deletedCount > 0
}

/**
 * Creates a new approval request, atomically handling existing duplicates by user and content key.
 *
 * If a pending request already exists for the user and content, returns the existing request without creating a new one. If an expired request exists, deletes it before creating a new request. For approved or rejected requests, always creates a new request. The operation is performed within a transaction to ensure consistency.
 *
 * @returns An object containing the approval request and a boolean indicating whether it was newly created.
 */
export async function createApprovalRequestWithExpiredHandling(
  this: DatabaseService,
  data: CreateApprovalRequestData,
): Promise<{ request: ApprovalRequest; isNewlyCreated: boolean }> {
  return await this.knex.transaction(async (trx) => {
    // Check for existing request with the same user_id and content_key
    const existingRow = await trx('approval_requests')
      .select('approval_requests.*', 'users.name as user_name')
      .leftJoin('users', 'approval_requests.user_id', 'users.id')
      .where({
        'approval_requests.user_id': data.userId,
        'approval_requests.content_key': data.contentKey,
      })
      .first()

    if (existingRow) {
      const existing = mapRowToApprovalRequest.call(this, existingRow)

      if (existing.status === 'pending') {
        // Return existing pending request
        return { request: existing, isNewlyCreated: false }
      }

      if (existing.status === 'expired') {
        // Delete expired request to make room for new one
        await trx('approval_requests').where('id', existing.id).del()
      }
      // For approved/rejected, we continue to create a new request
    }

    // Create new approval request
    const [insertedRow] = await trx('approval_requests')
      .insert({
        user_id: data.userId,
        content_type: data.contentType,
        content_title: data.contentTitle,
        content_key: data.contentKey,
        content_guids: JSON.stringify(data.contentGuids || []),
        router_decision: JSON.stringify(data.routerDecision),
        router_rule_id: data.routerRuleId,
        approval_reason: data.approvalReason,
        triggered_by: data.triggeredBy,
        expires_at: data.expiresAt,
        status: 'pending',
        created_at: this.timestamp,
        updated_at: this.timestamp,
      })
      .returning('*')

    // Get the inserted row with username
    const rowWithUsername = await trx('approval_requests')
      .select('approval_requests.*', 'users.name as user_name')
      .leftJoin('users', 'approval_requests.user_id', 'users.id')
      .where('approval_requests.id', insertedRow.id)
      .first()

    return {
      request: mapRowToApprovalRequest.call(this, rowWithUsername),
      isNewlyCreated: true,
    }
  })
}

/**
 * Deletes expired approval requests that were last updated before a specified number of days ago.
 *
 * @param olderThanDays - The minimum age in days for expired requests to be deleted (default is 30)
 * @returns The number of approval requests deleted
 */
export async function cleanupExpiredRequests(
  this: DatabaseService,
  olderThanDays = 30,
): Promise<number> {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

  const deletedCount = await this.knex('approval_requests')
    .where('status', 'expired')
    .where('updated_at', '<', cutoffDate.toISOString())
    .del()

  return deletedCount
}
