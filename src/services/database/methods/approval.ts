import type {
  ApprovalRequest,
  ApprovalRequestRow,
  ApprovalStats,
  ApprovalStatus,
  CreateApprovalRequestData,
  UpdateApprovalRequestData,
  UserApprovalStats,
} from '@root/types/approval.types.js'
import type { DatabaseService } from '@services/database.service.js'

/**
 * Maps a database row to an ApprovalRequest object, parsing JSON fields and assigning default values for missing data.
 *
 * The returned object includes the user's name (defaulting to 'Unknown' if not present), parsed content GUIDs, and a default router decision if not specified.
 *
 * @returns The ApprovalRequest object constructed from the database row.
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
 * Creates a new approval request in the database and returns the complete request with user name included.
 *
 * The returned object contains all approval request fields and the associated user's name.
 *
 * @param data - The information required to create the approval request
 * @returns The newly created approval request with user details
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
 * Retrieves an approval request by its ID, including the associated user's name.
 *
 * @param id - The approval request's unique identifier
 * @returns The ApprovalRequest object if found, otherwise null
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
 * Retrieves an approval request matching the specified user ID and content key.
 *
 * @param userId - The user ID to filter approval requests by
 * @param contentKey - The content key to filter approval requests by
 * @returns The approval request if found, otherwise null
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
 * Updates specified fields of an approval request by its ID and returns the updated request.
 *
 * Only the fields present in the `data` parameter are modified. Returns the updated `ApprovalRequest` object with user name included, or `null` if no matching request exists.
 *
 * @param id - The unique identifier of the approval request to update
 * @param data - An object containing the fields to update
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
 * Approves an approval request by ID, recording the approver and optional notes.
 *
 * @param id - The unique identifier of the approval request
 * @param approvedBy - The user ID of the approver
 * @param notes - Optional notes to attach to the approval
 * @returns The updated approval request if found, otherwise null
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
 * Rejects an approval request by ID, setting its status to 'rejected' and recording the rejecting user's ID and optional reason.
 *
 * @param id - The unique identifier of the approval request to reject
 * @param rejectedBy - The user ID of the person rejecting the request
 * @param reason - An optional reason for rejection
 * @returns The updated ApprovalRequest if the request exists, or null if not found
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
 * Retrieves all pending approval requests, optionally filtered by user ID.
 *
 * If a user ID is provided, only requests created by that user are returned. Results are ordered by creation date in descending order and paginated using the provided limit and offset.
 *
 * @param userId - Optional user ID to filter requests by creator
 * @param limit - Maximum number of requests to return (default: 50)
 * @param offset - Number of requests to skip before collecting results (default: 0)
 * @returns An array of pending approval requests
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
 * Retrieves approval requests filtered by optional user, status, content type, and trigger source, with pagination support.
 *
 * @returns An array of approval requests matching the specified filters.
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
 * Counts approval requests that match the given optional filters.
 *
 * @param userId - Filter by user ID
 * @param status - Filter by approval status
 * @param contentType - Filter by content type ('movie' or 'show')
 * @param triggeredBy - Filter by trigger source
 * @returns The number of approval requests matching the filters
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
 * Retrieves all pending approval requests that have expired based on their expiration timestamp.
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
 * Aggregate counts of approval requests by status and the overall total.
 *
 * Queries the approval_requests table, groups rows by `status`, and returns per-status counts
 * along with `totalRequests` (the sum of all counted rows).
 *
 * @returns An object with numeric counters:
 *  - `pending` — number of requests with status "pending"
 *  - `approved` — number of requests with status "approved"
 *  - `rejected` — number of requests with status "rejected"
 *  - `expired` — number of requests with status "expired"
 *  - `auto_approved` — number of requests with status "auto_approved"
 *  - `totalRequests` — sum of all status counts
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
    auto_approved: 0,
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
      case 'auto_approved':
        result.auto_approved = count
        break
    }
  }

  return result
}

/**
 * Retrieves aggregated approval statistics and quota details for a specific user.
 *
 * Returns an object with the user's name, counts of approval requests by status, total requests, current quota usage, quota limit and type, and whether approval can be bypassed.
 *
 * @param userId - The ID of the user whose approval statistics are requested
 * @returns A `UserApprovalStats` object containing user details, request counts by status, quota usage, quota limits, quota type, and bypass approval flag
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
        stats.approvedRequests += count
        break
      case 'auto_approved':
        stats.approvedRequests += count
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
 * Expires all pending approval requests whose `expires_at` timestamp is earlier than the current time.
 *
 * @returns The number of approval requests that were updated to expired.
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
 * Deletes an approval request by its unique ID.
 *
 * @param id - The ID of the approval request to delete
 * @returns `true` if a request was deleted; `false` if no matching request was found
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
 * Retrieve approval requests matching the provided filters.
 *
 * Returns approval requests joined with the submitting user's name, ordered by `created_at` descending.
 *
 * @param criteria - Optional filters:
 *   - `userId`: limit to requests created by a specific user
 *   - `status`: filter by approval status
 *   - `contentType`: filter by content type (`'movie'` or `'show'`)
 * @returns An array of ApprovalRequest objects matching the criteria.
 */
export async function getApprovalRequestsByCriteria(
  this: DatabaseService,
  criteria: {
    userId?: number
    status?: ApprovalStatus
    contentType?: 'movie' | 'show'
  },
): Promise<ApprovalRequest[]> {
  let query = this.knex('approval_requests')
    .select('approval_requests.*', 'users.name as user_name')
    .leftJoin('users', 'approval_requests.user_id', 'users.id')

  if (criteria.userId !== undefined) {
    query = query.where('approval_requests.user_id', criteria.userId)
  }

  if (criteria.status) {
    query = query.where('approval_requests.status', criteria.status)
  }

  if (criteria.contentType) {
    query = query.where('approval_requests.content_type', criteria.contentType)
  }

  const rows = await query.orderBy('approval_requests.created_at', 'desc')
  return rows.map((row) => mapRowToApprovalRequest.call(this, row))
}

/**
 * Update the user attribution for an approval request (used for reconciliation).
 *
 * Sets the request's `user_id`, clears `approved_by` (null for auto-approved attribution), and sets `approval_notes`, updating `updated_at`.
 *
 * @param id - ID of the approval request to update
 * @param userId - New user ID to attribute the request to
 * @param approvalNotes - Notes explaining the attribution change
 * @returns The updated ApprovalRequest including the user's name, or `null` if no matching request was found
 */
export async function updateApprovalRequestAttribution(
  this: DatabaseService,
  id: number,
  userId: number,
  approvalNotes: string,
): Promise<ApprovalRequest | null> {
  const updated = await this.knex('approval_requests')
    .where('id', id)
    .update({
      user_id: userId,
      approved_by: null, // Attribution updates for auto-approved items don't need an admin approver
      approval_notes: approvalNotes,
      updated_at: this.timestamp,
    })
    .returning('*')

  if (updated.length === 0) {
    return null
  }

  // Get the updated record with user name
  const row = await this.knex('approval_requests')
    .select('approval_requests.*', 'users.name as user_name')
    .leftJoin('users', 'approval_requests.user_id', 'users.id')
    .where('approval_requests.id', id)
    .first()

  return row ? mapRowToApprovalRequest.call(this, row) : null
}

/**
 * Creates a new approval request, ensuring no duplicate pending requests exist for the same user and content key.
 *
 * If a pending request already exists for the user and content, returns that request without creating a new one. If an expired request exists, deletes it before creating a new request. For approved or rejected requests, always creates a new request. The entire operation is performed atomically within a transaction.
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
 * Permanently deletes expired approval requests last updated before a specified number of days ago.
 *
 * @param olderThanDays - The minimum number of days since last update for expired requests to be deleted (default is 30)
 * @returns The count of approval requests deleted
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
