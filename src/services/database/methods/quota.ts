import type { DatabaseService } from '@services/database.service.js'
import type {
  UserQuotaConfig,
  UserQuotaRow,
  QuotaUsage,
  QuotaUsageRow,
  QuotaStatus,
  QuotaType,
  QuotaExceeded,
  CreateUserQuotaData,
  UpdateUserQuotaData,
} from '@root/types/approval.types.js'

/**
 * Maps a database row to a UserQuotaConfig object
 */
function mapRowToUserQuotaConfig(row: UserQuotaRow): UserQuotaConfig {
  return {
    userId: row.user_id,
    quotaType: row.quota_type,
    quotaLimit: row.quota_limit,
    resetDay: row.reset_day,
    bypassApproval: Boolean(row.bypass_approval),
  }
}

/**
 * Maps a database row to a QuotaUsage object
 */
function mapRowToQuotaUsage(row: QuotaUsageRow): QuotaUsage {
  return {
    userId: row.user_id,
    contentType: row.content_type,
    requestDate: row.request_date,
  }
}

/**
 * Gets date range for quota calculations based on quota type
 */
function getDateRange(quotaType: QuotaType): { start: string; end: string } {
  const now = new Date()
  const end = now.toISOString().split('T')[0]
  let start: string

  switch (quotaType) {
    case 'daily': {
      start = end // Same day
      break
    }
    case 'weekly_rolling': {
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() - 6) // Last 7 days
      start = weekStart.toISOString().split('T')[0]
      break
    }
    case 'monthly': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      start = monthStart.toISOString().split('T')[0]
      break
    }
    default: {
      start = end
    }
  }

  return { start, end }
}

/**
 * Gets the next reset date for a quota type
 */
function getNextResetDate(
  quotaType: QuotaType,
  resetDay?: number,
): Date | undefined {
  const now = new Date()

  switch (quotaType) {
    case 'daily': {
      const tomorrow = new Date(now)
      tomorrow.setDate(now.getDate() + 1)
      tomorrow.setHours(0, 0, 0, 0)
      return tomorrow
    }

    case 'weekly_rolling': {
      // Rolling window, no fixed reset
      return undefined
    }

    case 'monthly': {
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      if (resetDay && resetDay >= 1 && resetDay <= 31) {
        const daysInMonth = new Date(
          nextMonth.getFullYear(),
          nextMonth.getMonth() + 1,
          0,
        ).getDate()
        nextMonth.setDate(Math.min(resetDay, daysInMonth))
      }
      return nextMonth
    }

    default: {
      return undefined
    }
  }
}

/**
 * Creates a new user quota configuration
 */
export async function createUserQuota(
  this: DatabaseService,
  data: CreateUserQuotaData,
): Promise<UserQuotaConfig> {
  const [row] = await this.knex('user_quotas')
    .insert({
      user_id: data.userId,
      quota_type: data.quotaType,
      quota_limit: data.quotaLimit,
      reset_day: data.resetDay,
      bypass_approval: data.bypassApproval || false,
      created_at: this.timestamp,
      updated_at: this.timestamp,
    })
    .returning('*')

  return mapRowToUserQuotaConfig(row)
}

/**
 * Gets a user's quota configuration
 */
export async function getUserQuota(
  this: DatabaseService,
  userId: number,
): Promise<UserQuotaConfig | null> {
  const row = await this.knex('user_quotas').where('user_id', userId).first()
  return row ? mapRowToUserQuotaConfig(row) : null
}

/**
 * Updates a user's quota configuration
 */
export async function updateUserQuota(
  this: DatabaseService,
  userId: number,
  data: UpdateUserQuotaData,
): Promise<UserQuotaConfig | null> {
  const updateData: Partial<UserQuotaRow> = {
    updated_at: this.timestamp,
  }

  if (data.quotaType !== undefined) updateData.quota_type = data.quotaType
  if (data.quotaLimit !== undefined) updateData.quota_limit = data.quotaLimit
  if (data.resetDay !== undefined) updateData.reset_day = data.resetDay
  if (data.bypassApproval !== undefined)
    updateData.bypass_approval = data.bypassApproval

  const [row] = await this.knex('user_quotas')
    .where('user_id', userId)
    .update(updateData)
    .returning('*')

  return row ? mapRowToUserQuotaConfig(row) : null
}

/**
 * Deletes a user's quota configuration
 */
export async function deleteUserQuota(
  this: DatabaseService,
  userId: number,
): Promise<boolean> {
  const deletedCount = await this.knex('user_quotas')
    .where('user_id', userId)
    .del()
  return deletedCount > 0
}

/**
 * Records quota usage for a user
 */
export async function recordQuotaUsage(
  this: DatabaseService,
  userId: number,
  contentType: 'movie' | 'show',
  requestDate: Date = new Date(),
): Promise<QuotaUsage> {
  const dateString = requestDate.toISOString().split('T')[0] // YYYY-MM-DD

  await this.knex('quota_usage').insert({
    user_id: userId,
    content_type: contentType,
    request_date: dateString,
    created_at: this.timestamp,
  })

  return {
    userId,
    contentType,
    requestDate: dateString,
  }
}

/**
 * Gets current quota usage for a user
 */
export async function getCurrentQuotaUsage(
  this: DatabaseService,
  userId: number,
  quotaType: QuotaType,
  contentType?: 'movie' | 'show',
): Promise<number> {
  const dateRange = getDateRange(quotaType)
  let query = this.knex('quota_usage')
    .where('user_id', userId)
    .where('request_date', '>=', dateRange.start)
    .where('request_date', '<=', dateRange.end)

  if (contentType) {
    query = query.where('content_type', contentType)
  }

  const result = await query.count('* as count').first()
  return Number.parseInt(result?.count as string, 10) || 0
}

/**
 * Gets quota status for a user
 */
export async function getQuotaStatus(
  this: DatabaseService,
  userId: number,
  contentType?: 'movie' | 'show',
): Promise<QuotaStatus | null> {
  const quota = await this.getUserQuota(userId)
  if (!quota) {
    return null
  }

  const currentUsage = await this.getCurrentQuotaUsage(
    userId,
    quota.quotaType,
    contentType,
  )

  const exceeded = currentUsage >= quota.quotaLimit
  const resetDate = getNextResetDate(quota.quotaType, quota.resetDay)

  return {
    quotaType: quota.quotaType,
    quotaLimit: quota.quotaLimit,
    currentUsage,
    exceeded,
    resetDate,
    bypassApproval: quota.bypassApproval,
  }
}

/**
 * Checks if a user's quota is exceeded
 */
export async function checkQuotaExceeded(
  this: DatabaseService,
  userId: number,
  contentType?: 'movie' | 'show',
): Promise<QuotaExceeded | null> {
  const status = await this.getQuotaStatus(userId, contentType)
  if (!status || !status.exceeded) {
    return null
  }

  return {
    type: status.quotaType,
    limit: status.quotaLimit,
    usage: status.currentUsage,
    exceeded: true,
  }
}

/**
 * Gets all users with quota configurations
 */
export async function getUsersWithQuotas(
  this: DatabaseService,
): Promise<UserQuotaConfig[]> {
  const rows = await this.knex('user_quotas').select('*')
  return rows.map(mapRowToUserQuotaConfig)
}

/**
 * Gets quota usage history for a user
 */
export async function getQuotaUsageHistory(
  this: DatabaseService,
  userId: number,
  startDate?: Date,
  endDate?: Date,
  contentType?: 'movie' | 'show',
): Promise<QuotaUsage[]> {
  let query = this.knex('quota_usage').where('user_id', userId)

  if (startDate) {
    query = query.where(
      'request_date',
      '>=',
      startDate.toISOString().split('T')[0],
    )
  }

  if (endDate) {
    query = query.where(
      'request_date',
      '<=',
      endDate.toISOString().split('T')[0],
    )
  }

  if (contentType) {
    query = query.where('content_type', contentType)
  }

  const rows = await query.orderBy('request_date', 'desc')
  return rows.map(mapRowToQuotaUsage)
}

/**
 * Gets daily usage statistics for a user
 */
export async function getDailyUsageStats(
  this: DatabaseService,
  userId: number,
  days = 30,
): Promise<{ date: string; movies: number; shows: number; total: number }[]> {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(endDate.getDate() - days)

  const startDateString = startDate.toISOString().split('T')[0]
  const endDateString = endDate.toISOString().split('T')[0]

  const usage = await this.knex('quota_usage')
    .select('request_date', 'content_type')
    .count('* as count')
    .where('user_id', userId)
    .where('request_date', '>=', startDateString)
    .where('request_date', '<=', endDateString)
    .groupBy('request_date', 'content_type')
    .orderBy('request_date', 'desc')

  const statsMap = new Map<
    string,
    { date: string; movies: number; shows: number; total: number }
  >()

  // Initialize all dates with zero counts
  for (let i = 0; i < days; i++) {
    const date = new Date(endDate)
    date.setDate(date.getDate() - i)
    const dateString = date.toISOString().split('T')[0]
    statsMap.set(dateString, {
      date: dateString,
      movies: 0,
      shows: 0,
      total: 0,
    })
  }

  // Fill in actual usage data
  for (const row of usage) {
    const date = String(row.request_date)
    const count = Number(row.count)
    const existing = statsMap.get(date)

    if (existing) {
      if (row.content_type === 'movie') {
        existing.movies = count
      } else if (row.content_type === 'show') {
        existing.shows = count
      }
      existing.total = existing.movies + existing.shows
    }
  }

  return Array.from(statsMap.values()).sort((a, b) =>
    b.date.localeCompare(a.date),
  )
}

/**
 * Cleans up old quota usage records
 */
export async function cleanupOldQuotaUsage(
  this: DatabaseService,
  olderThanDays = 90,
): Promise<number> {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)
  const cutoffString = cutoffDate.toISOString().split('T')[0]

  const deletedCount = await this.knex('quota_usage')
    .where('request_date', '<', cutoffString)
    .del()

  return deletedCount
}

/**
 * Gets users with a specific quota type
 */
export async function getUsersWithQuotaType(
  this: DatabaseService,
  quotaType: QuotaType,
): Promise<UserQuotaConfig[]> {
  const rows = await this.knex('user_quotas')
    .where('quota_type', quotaType)
    .select('*')
  return rows.map(mapRowToUserQuotaConfig)
}

/**
 * Gets the latest quota usage for a user
 */
export async function getLatestQuotaUsage(
  this: DatabaseService,
  userId: number,
): Promise<QuotaUsage | null> {
  const row = await this.knex('quota_usage')
    .where('user_id', userId)
    .orderBy('request_date', 'desc')
    .first()

  return row ? mapRowToQuotaUsage(row) : null
}

/**
 * Gets the last quota reset date for a user
 */
export async function getLastQuotaReset(
  this: DatabaseService,
  userId: number,
): Promise<string | null> {
  // For now, we'll use a simple approach by checking if there's usage in the current month
  // In a more robust implementation, you might want a separate quota_resets table
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const row = await this.knex('quota_usage')
    .where('user_id', userId)
    .where('request_date', 'like', `${currentMonth}%`)
    .orderBy('request_date', 'desc')
    .first()

  return row ? row.request_date : null
}

/**
 * Records a quota reset for a user
 */
export async function recordQuotaReset(
  this: DatabaseService,
  userId: number,
  resetPeriod: string,
): Promise<void> {
  // For now, we'll just log the reset
  // In a more robust implementation, you might want a separate quota_resets table
  this.log.info(
    `Recording quota reset for user ${userId} in period ${resetPeriod}`,
  )
}
