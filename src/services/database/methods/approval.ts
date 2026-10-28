import { QUOTA_DEFAULTS } from '@root/schemas/shared/quota-limits.js'
import type {
  ApprovalRequest,
  ApprovalRequestRow,
  ApprovalStats,
  ApprovalStatus,
  ApprovalTrigger,
  CreateApprovalRequestData,
  UpdateApprovalRequestData,
  UserApprovalStats,
} from '@root/types/approval.types.js'
import { normalizeGuid } from '@root/utils/guid-handler.js'
import { applySearchFilter } from '@services/database/search-filter.js'
import type { DatabaseService } from '@services/database.service.js'
import type { Knex } from 'knex'

type ApprovalRequestJoinedRow = ApprovalRequestRow & {
  user_name: string | null
}

function selectWithUser(
  query: Knex.QueryBuilder,
): Knex.QueryBuilder<ApprovalRequestRow, ApprovalRequestJoinedRow[]> {
  return query
    .select('approval_requests.*', 'users.name as user_name')
    .leftJoin('users', 'approval_requests.user_id', 'users.id')
}

function mapRowToApprovalRequest(
  this: DatabaseService,
  row: ApprovalRequestJoinedRow,
): ApprovalRequest {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name || 'Unknown',
    contentType: row.content_type,
    contentTitle: row.content_title,
    contentKey: row.content_key,
    thumb: row.thumb || null,
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
      thumb: data.thumb || null,
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

  const rowWithUsername = await selectWithUser(this.knex('approval_requests'))
    .where('approval_requests.id', row.id)
    .first()

  if (!rowWithUsername) {
    throw new Error('Failed to retrieve approval request after creation')
  }

  return mapRowToApprovalRequest.call(this, rowWithUsername)
}

export async function getApprovalRequest(
  this: DatabaseService,
  id: number,
): Promise<ApprovalRequest | null> {
  const row = await selectWithUser(this.knex('approval_requests'))
    .where('approval_requests.id', id)
    .first()
  return row ? mapRowToApprovalRequest.call(this, row) : null
}

export async function getApprovalRequestByContent(
  this: DatabaseService,
  userId: number,
  contentKey: string,
): Promise<ApprovalRequest | null> {
  const row = await selectWithUser(this.knex('approval_requests'))
    .where('approval_requests.user_id', userId)
    .where('approval_requests.content_key', contentKey)
    .first()
  return row ? mapRowToApprovalRequest.call(this, row) : null
}

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

  const updatedRow = await selectWithUser(this.knex('approval_requests'))
    .where('approval_requests.id', id)
    .first()

  return updatedRow ? mapRowToApprovalRequest.call(this, updatedRow) : null
}

export async function approveRequest(
  this: DatabaseService,
  id: number,
  approvedBy: number | null,
  notes?: string,
): Promise<ApprovalRequest | null> {
  return this.updateApprovalRequest(id, {
    status: 'approved',
    approvedBy,
    approvalNotes: notes,
  })
}

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

export async function getPendingApprovalRequests(
  this: DatabaseService,
  userId?: number,
  limit = 50,
  offset = 0,
): Promise<ApprovalRequest[]> {
  let query = selectWithUser(this.knex('approval_requests')).where(
    'approval_requests.status',
    'pending',
  )

  if (userId) {
    query = query.where('approval_requests.user_id', userId)
  }

  const rows = await query
    .orderBy('approval_requests.created_at', 'desc')
    .limit(limit)
    .offset(offset)

  return rows.map((row) => mapRowToApprovalRequest.call(this, row))
}

export async function getApprovalHistory(
  this: DatabaseService,
  userId?: number | number[],
  status?: ApprovalStatus | ApprovalStatus[],
  limit = 50,
  offset = 0,
  contentType?: 'movie' | 'show' | ('movie' | 'show')[],
  triggeredBy?: ApprovalTrigger | ApprovalTrigger[],
  search?: string,
  sortBy:
    | 'contentTitle'
    | 'userName'
    | 'status'
    | 'triggeredBy'
    | 'createdAt'
    | 'expiresAt' = 'createdAt',
  sortOrder: 'asc' | 'desc' = 'desc',
): Promise<ApprovalRequest[]> {
  const sortColumnMap: Record<string, string> = {
    contentTitle: 'approval_requests.content_title',
    userName: 'users.name',
    status: 'approval_requests.status',
    triggeredBy: 'approval_requests.triggered_by',
    createdAt: 'approval_requests.created_at',
    expiresAt: 'approval_requests.expires_at',
  }

  let query = selectWithUser(this.knex('approval_requests'))

  if (userId) {
    if (Array.isArray(userId)) {
      query = query.whereIn('approval_requests.user_id', userId)
    } else {
      query = query.where('approval_requests.user_id', userId)
    }
  }

  if (status) {
    if (Array.isArray(status)) {
      query = query.whereIn('approval_requests.status', status)
    } else {
      query = query.where('approval_requests.status', status)
    }
  }

  if (contentType) {
    if (Array.isArray(contentType)) {
      query = query.whereIn('approval_requests.content_type', contentType)
    } else {
      query = query.where('approval_requests.content_type', contentType)
    }
  }

  if (triggeredBy) {
    if (Array.isArray(triggeredBy)) {
      query = query.whereIn('approval_requests.triggered_by', triggeredBy)
    } else {
      query = query.where('approval_requests.triggered_by', triggeredBy)
    }
  }

  if (search) {
    query = applySearchFilter(
      query,
      search,
      'approval_requests.content_title',
      this.isPostgres,
    )
  }

  const orderColumn = sortColumnMap[sortBy] || 'approval_requests.created_at'

  const rows = await query
    .orderBy(orderColumn, sortOrder)
    .limit(limit)
    .offset(offset)

  return rows.map((row) => mapRowToApprovalRequest.call(this, row))
}

export async function getApprovalHistoryCount(
  this: DatabaseService,
  userId?: number | number[],
  status?: ApprovalStatus | ApprovalStatus[],
  contentType?: 'movie' | 'show' | ('movie' | 'show')[],
  triggeredBy?: ApprovalTrigger | ApprovalTrigger[],
  search?: string,
): Promise<number> {
  let query = this.knex('approval_requests')

  if (userId) {
    if (Array.isArray(userId)) {
      query = query.whereIn('approval_requests.user_id', userId)
    } else {
      query = query.where('approval_requests.user_id', userId)
    }
  }

  if (status) {
    if (Array.isArray(status)) {
      query = query.whereIn('approval_requests.status', status)
    } else {
      query = query.where('approval_requests.status', status)
    }
  }

  if (contentType) {
    if (Array.isArray(contentType)) {
      query = query.whereIn('approval_requests.content_type', contentType)
    } else {
      query = query.where('approval_requests.content_type', contentType)
    }
  }

  if (triggeredBy) {
    if (Array.isArray(triggeredBy)) {
      query = query.whereIn('approval_requests.triggered_by', triggeredBy)
    } else {
      query = query.where('approval_requests.triggered_by', triggeredBy)
    }
  }

  if (search) {
    query = applySearchFilter(
      query,
      search,
      'approval_requests.content_title',
      this.isPostgres,
    )
  }

  const result = await query.count('* as count').first()
  return Number.parseInt(String(result?.count), 10) || 0
}

export async function getExpiredPendingRequests(
  this: DatabaseService,
): Promise<ApprovalRequest[]> {
  const rows = await selectWithUser(this.knex('approval_requests'))
    .where('approval_requests.status', 'pending')
    .where('approval_requests.expires_at', '<', this.timestamp)
    .whereNotNull('approval_requests.expires_at')
    .orderBy('approval_requests.expires_at', 'asc')

  return rows.map((row) => mapRowToApprovalRequest.call(this, row))
}

/** Returns oldest first, so callers process requests in FIFO order */
export async function getPendingRequestsByTrigger(
  this: DatabaseService,
  trigger: ApprovalTrigger,
  userId?: number,
): Promise<ApprovalRequest[]> {
  let query = selectWithUser(this.knex('approval_requests'))
    .where('approval_requests.status', 'pending')
    .where('approval_requests.triggered_by', trigger)

  if (userId) {
    query = query.where('approval_requests.user_id', userId)
  }

  const rows = await query.orderBy('approval_requests.created_at', 'asc')

  return rows.map((row) => mapRowToApprovalRequest.call(this, row))
}

export async function getPendingQuotaExceededCountForUser(
  this: DatabaseService,
  userId: number,
): Promise<{ movieCount: number; showCount: number }> {
  const rows = await this.knex('approval_requests')
    .select('content_type')
    .count('* as count')
    .where('user_id', userId)
    .where('status', 'pending')
    .where('triggered_by', 'quota_exceeded')
    .groupBy('content_type')

  let movieCount = 0
  let showCount = 0

  for (const row of rows) {
    const count = Number.parseInt(String(row.count), 10)
    if (row.content_type === 'movie') {
      movieCount = count
    } else if (row.content_type === 'show') {
      showCount = count
    }
  }

  return { movieCount, showCount }
}

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

/** currentQuotaUsage is always 0, and the quota fields come from whichever user_quotas row is found first */
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
    quotaType: quotaInfo?.quota_type || QUOTA_DEFAULTS.quotaType,
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

export async function deleteApprovalRequest(
  this: DatabaseService,
  id: number,
): Promise<boolean> {
  const deletedCount = await this.knex('approval_requests')
    .where('id', id)
    .del()

  return deletedCount > 0
}

export async function getApprovalRequestsByCriteria(
  this: DatabaseService,
  criteria: {
    userId?: number
    status?: ApprovalStatus
    contentType?: 'movie' | 'show'
  },
): Promise<ApprovalRequest[]> {
  let query = selectWithUser(this.knex('approval_requests'))

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

export async function getAllApprovedApprovalRequests(
  this: DatabaseService,
): Promise<ApprovalRequest[]> {
  const rows = await selectWithUser(this.knex('approval_requests')).whereIn(
    'approval_requests.status',
    ['approved', 'auto_approved'],
  )

  return rows.map((row) => mapRowToApprovalRequest.call(this, row))
}

/** Returns the normalized GUIDs of approved and auto-approved requests */
export async function getTrackedContentGuids(
  this: DatabaseService,
): Promise<Set<string>> {
  const rows = await this.knex('approval_requests')
    .select('content_guids')
    .whereIn('status', ['approved', 'auto_approved'])

  const guidSet = new Set<string>()

  for (const row of rows) {
    try {
      const guids = this.safeJsonParse<string[]>(
        row.content_guids,
        [],
        'approval.content_guids',
      )
      for (const guid of guids) {
        if (guid && typeof guid === 'string') {
          const normalized = normalizeGuid(guid.trim())
          if (normalized) {
            guidSet.add(normalized)
          }
        }
      }
    } catch (error) {
      this.log.warn(
        { error, content_guids: row.content_guids },
        'Error parsing content_guids from approval_requests',
      )
    }
  }

  return guidSet
}

export async function getApprovalRequestsByGuids(
  this: DatabaseService,
  guids: Set<string>,
  contentType: 'movie' | 'show',
): Promise<ApprovalRequest[]> {
  if (guids.size === 0) {
    return []
  }

  const guidArray = Array.from(guids)

  let query = selectWithUser(this.knex('approval_requests')).where(
    'approval_requests.content_type',
    contentType,
  )

  if (this.isPostgres) {
    // content_guids is a json column, so it needs a jsonb cast for jsonb_array_elements_text
    query = query.whereRaw(
      'EXISTS (SELECT 1 FROM jsonb_array_elements_text(content_guids::jsonb) elem WHERE lower(elem) = ANY(?))',
      [guidArray.map((g) => g.toLowerCase())],
    )
  } else {
    query = query.andWhere((builder) => {
      for (const guid of guidArray) {
        builder.orWhereRaw(
          "EXISTS (SELECT 1 FROM json_each(content_guids) WHERE json_each.type = 'text' AND lower(json_each.value) = ?)",
          [guid.toLowerCase()],
        )
      }
    })
  }

  const rows = await query

  return rows.map((row) => mapRowToApprovalRequest.call(this, row))
}

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

  const row = await selectWithUser(this.knex('approval_requests'))
    .where('approval_requests.id', id)
    .first()

  return row ? mapRowToApprovalRequest.call(this, row) : null
}

/** Returns an existing pending request instead of inserting, and replaces an expired one */
export async function createApprovalRequestWithExpiredHandling(
  this: DatabaseService,
  data: CreateApprovalRequestData,
): Promise<{ request: ApprovalRequest; isNewlyCreated: boolean }> {
  return await this.knex.transaction(async (trx) => {
    const existingRow = await selectWithUser(trx('approval_requests'))
      .where('approval_requests.user_id', data.userId)
      .where('approval_requests.content_key', data.contentKey)
      .first()

    if (existingRow) {
      const existing = mapRowToApprovalRequest.call(this, existingRow)

      if (existing.status === 'pending') {
        return { request: existing, isNewlyCreated: false }
      }

      if (existing.status === 'expired') {
        await trx('approval_requests').where('id', existing.id).del()
      }
    }

    const [insertedRow] = await trx('approval_requests')
      .insert({
        user_id: data.userId,
        content_type: data.contentType,
        content_title: data.contentTitle,
        content_key: data.contentKey,
        thumb: data.thumb || null,
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

    const rowWithUsername = await selectWithUser(trx('approval_requests'))
      .where('approval_requests.id', insertedRow.id)
      .first()

    if (!rowWithUsername) {
      throw new Error('Failed to retrieve approval request after creation')
    }

    return {
      request: mapRowToApprovalRequest.call(this, rowWithUsername),
      isNewlyCreated: true,
    }
  })
}

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
