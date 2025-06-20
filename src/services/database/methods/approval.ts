import type { DatabaseService } from '@services/database.service.js'
import type {
  ApprovalRequest,
  ApprovalRequestRow,
  CreateApprovalRequestData,
  UpdateApprovalRequestData,
  ApprovalStats,
  UserApprovalStats,
  RouterDecision,
  ApprovalStatus,
} from '@root/types/approval.types.js'

/**
 * Maps a database row to an ApprovalRequest object
 */
function mapRowToApprovalRequest(row: ApprovalRequestRow): ApprovalRequest {
  return {
    id: row.id,
    userId: row.user_id,
    contentType: row.content_type,
    contentTitle: row.content_title,
    contentKey: row.content_key,
    contentGuids: Array.isArray(row.content_guids)
      ? row.content_guids
      : JSON.parse(row.content_guids as string),
    proposedRouterDecision:
      typeof row.router_decision === 'object'
        ? (row.router_decision as RouterDecision)
        : JSON.parse(row.router_decision as string),
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
 * Creates a new approval request in the database
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

  return mapRowToApprovalRequest(row)
}

/**
 * Retrieves an approval request by ID
 */
export async function getApprovalRequest(
  this: DatabaseService,
  id: number,
): Promise<ApprovalRequest | null> {
  const row = await this.knex('approval_requests').where('id', id).first()
  return row ? mapRowToApprovalRequest(row) : null
}

/**
 * Retrieves an approval request by user and content key
 */
export async function getApprovalRequestByContent(
  this: DatabaseService,
  userId: number,
  contentKey: string,
): Promise<ApprovalRequest | null> {
  const row = await this.knex('approval_requests')
    .where({ user_id: userId, content_key: contentKey })
    .first()
  return row ? mapRowToApprovalRequest(row) : null
}

/**
 * Updates an approval request
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

  const [row] = await this.knex('approval_requests')
    .where('id', id)
    .update(updateData)
    .returning('*')

  return row ? mapRowToApprovalRequest(row) : null
}

/**
 * Approves an approval request
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
 * Rejects an approval request
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
 * Gets pending approval requests
 */
export async function getPendingApprovalRequests(
  this: DatabaseService,
  userId?: number,
  limit = 50,
  offset = 0,
): Promise<ApprovalRequest[]> {
  let query = this.knex('approval_requests').where('status', 'pending')

  if (userId) {
    query = query.where('user_id', userId)
  }

  const rows = await query
    .orderBy('created_at', 'desc')
    .limit(limit)
    .offset(offset)

  return rows.map(mapRowToApprovalRequest)
}

/**
 * Gets approval history with optional filters
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

  if (userId) {
    query = query.where('user_id', userId)
  }

  if (status) {
    query = query.where('status', status)
  }

  if (contentType) {
    query = query.where('content_type', contentType)
  }

  if (triggeredBy) {
    query = query.where('triggered_by', triggeredBy)
  }

  const rows = await query
    .orderBy('updated_at', 'desc')
    .limit(limit)
    .offset(offset)

  return rows.map(mapRowToApprovalRequest)
}

/**
 * Gets overall approval statistics
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
    const count = Number.parseInt(stat.count as string, 10)
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
 * Gets approval statistics for a specific user
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
    const count = Number.parseInt(stat.count as string, 10)
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
 * Expires old pending requests based on their expires_at timestamp
 */
export async function expireOldRequests(
  this: DatabaseService,
): Promise<number> {
  const expiredCount = await this.knex('approval_requests')
    .where('status', 'pending')
    .where('expires_at', '<', new Date().toISOString())
    .update({
      status: 'expired',
      updated_at: this.timestamp,
    })

  return expiredCount
}

/**
 * Deletes an approval request permanently from the database
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
 * Creates an approval request, handling expired duplicates atomically
 */
export async function createApprovalRequestWithExpiredHandling(
  this: DatabaseService,
  data: CreateApprovalRequestData,
): Promise<ApprovalRequest> {
  return await this.knex.transaction(async (trx) => {
    // Check for existing request with the same user_id and content_key
    const existingRow = await trx('approval_requests')
      .where({
        user_id: data.userId,
        content_key: data.contentKey,
      })
      .first()

    if (existingRow) {
      const existing = mapRowToApprovalRequest(existingRow)

      if (existing.status === 'pending') {
        // Return existing pending request
        return existing
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

    return mapRowToApprovalRequest(insertedRow)
  })
}

/**
 * Cleans up old expired requests
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
