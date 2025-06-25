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
async function getDateRange(
  this: DatabaseService,
  quotaType: QuotaType,
): Promise<{ start: string; end: string }> {
  const now = new Date()
  const end = this.getLocalDateString(now)
  let start: string

  switch (quotaType) {
    case 'daily': {
      start = end // Same day
      break
    }
    case 'weekly_rolling': {
      // Weekly rolling quotas reset every 7 days starting from the most recent quota reset
      const weekStart = await this.getWeeklyRollingStartDate()
      start = this.getLocalDateString(weekStart)
      break
    }
    case 'monthly': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      start = this.getLocalDateString(monthStart)
      break
    }
    default: {
      start = end
    }
  }

  return { start, end }
}

/**
 * Gets the next reset date for a quota type based on the maintenance schedule
 */
async function getNextResetDate(
  this: DatabaseService,
  quotaType: QuotaType,
): Promise<Date | undefined> {
  switch (quotaType) {
    case 'daily':
    case 'monthly': {
      // Both daily and monthly quotas reset when maintenance runs
      // Use the actual maintenance schedule from the database
      return await this.getNextMaintenanceRun()
    }

    case 'weekly_rolling': {
      // Weekly rolling quotas reset every 7 days when maintenance runs
      return await this.getNextMaintenanceRun()
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
  const dateString = this.getLocalDateString(requestDate) // YYYY-MM-DD in local timezone

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
  const dateRange = await getDateRange.call(this, quotaType)
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
  const resetDate = await getNextResetDate.call(this, quota.quotaType)

  return {
    quotaType: quota.quotaType,
    quotaLimit: quota.quotaLimit,
    currentUsage,
    exceeded,
    resetDate: resetDate ? resetDate.toISOString() : null,
    bypassApproval: quota.bypassApproval,
  }
}

/**
 * Gets quota status for multiple users in a single optimized query
 */
export async function getBulkQuotaStatus(
  this: DatabaseService,
  userIds: number[],
  contentType?: 'movie' | 'show',
): Promise<Array<{ userId: number; quotaStatus: QuotaStatus | null }>> {
  if (userIds.length === 0) {
    return []
  }

  // Get all quota configurations for the requested users
  const quotaRows = await this.knex('user_quotas')
    .whereIn('user_id', userIds)
    .select('*')

  const quotaMap = new Map<number, UserQuotaConfig>()
  for (const row of quotaRows) {
    quotaMap.set(row.user_id, mapRowToUserQuotaConfig(row))
  }

  // Build usage queries for each quota type to minimize database hits
  const quotasByType = new Map<
    QuotaType,
    Array<{ userId: number; quota: UserQuotaConfig }>
  >()

  // Group quotas by type for efficient batch processing
  for (const userId of userIds) {
    const quota = quotaMap.get(userId)
    if (quota) {
      if (!quotasByType.has(quota.quotaType)) {
        quotasByType.set(quota.quotaType, [])
      }
      quotasByType.get(quota.quotaType)?.push({ userId, quota })
    }
  }

  // Create optimized queries for each quota type
  const usageResults = new Map<number, number>()

  for (const [quotaType, quotasOfType] of quotasByType.entries()) {
    const dateRange = await getDateRange.call(this, quotaType)
    const userIdsForType = quotasOfType.map((q) => q.userId)

    let query = this.knex('quota_usage')
      .select('user_id')
      .count('* as count')
      .whereIn('user_id', userIdsForType)
      .where('request_date', '>=', dateRange.start)
      .where('request_date', '<=', dateRange.end)
      .groupBy('user_id')

    if (contentType) {
      query = query.where('content_type', contentType)
    }

    const usageRows = await query

    // Map results
    for (const row of usageRows) {
      usageResults.set(
        Number(row.user_id),
        Number.parseInt(row.count as string, 10) || 0,
      )
    }

    // Set zero usage for users with no records
    for (const { userId } of quotasOfType) {
      if (!usageResults.has(userId)) {
        usageResults.set(userId, 0)
      }
    }
  }

  // Get reset dates for all quota types (cached to avoid multiple calls)
  const resetDateCache = new Map<QuotaType, Date | undefined>()
  const uniqueQuotaTypes = new Set<QuotaType>()
  for (const quota of quotaMap.values()) {
    uniqueQuotaTypes.add(quota.quotaType)
  }
  for (const quotaType of uniqueQuotaTypes) {
    const resetDate = await getNextResetDate.call(this, quotaType)
    resetDateCache.set(quotaType, resetDate)
  }

  // Build final results
  const results: Array<{ userId: number; quotaStatus: QuotaStatus | null }> = []

  for (const userId of userIds) {
    const quota = quotaMap.get(userId)
    if (!quota) {
      results.push({ userId, quotaStatus: null })
      continue
    }

    const currentUsage = usageResults.get(userId) || 0
    const exceeded = currentUsage >= quota.quotaLimit
    const resetDate = resetDateCache.get(quota.quotaType)

    results.push({
      userId,
      quotaStatus: {
        quotaType: quota.quotaType,
        quotaLimit: quota.quotaLimit,
        currentUsage,
        exceeded,
        resetDate: resetDate ? resetDate.toISOString() : null,
        bypassApproval: quota.bypassApproval,
      },
    })
  }

  return results
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
  limit = 50,
  offset = 0,
): Promise<QuotaUsage[]> {
  let query = this.knex('quota_usage').where('user_id', userId)

  if (startDate) {
    query = query.where(
      'request_date',
      '>=',
      this.getLocalDateString(startDate),
    )
  }

  if (endDate) {
    query = query.where('request_date', '<=', this.getLocalDateString(endDate))
  }

  if (contentType) {
    query = query.where('content_type', contentType)
  }

  const rows = await query
    .orderBy('request_date', 'desc')
    .limit(limit)
    .offset(offset)
  return rows.map(mapRowToQuotaUsage)
}

/**
 * Gets total count of quota usage history records for a user
 */
export async function getQuotaUsageHistoryCount(
  this: DatabaseService,
  userId: number,
  startDate?: Date,
  endDate?: Date,
  contentType?: 'movie' | 'show',
): Promise<number> {
  let query = this.knex('quota_usage').where('user_id', userId)

  if (startDate) {
    query = query.where(
      'request_date',
      '>=',
      this.getLocalDateString(startDate),
    )
  }

  if (endDate) {
    query = query.where('request_date', '<=', this.getLocalDateString(endDate))
  }

  if (contentType) {
    query = query.where('content_type', contentType)
  }

  const result = await query.count('* as count').first()
  return Number.parseInt(result?.count as string, 10) || 0
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

  const startDateString = this.getLocalDateString(startDate)
  const endDateString = this.getLocalDateString(endDate)

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
    const dateString = this.getLocalDateString(date)
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
  const cutoffString = this.getLocalDateString(cutoffDate)

  const deletedCount = await this.knex('quota_usage')
    .where('request_date', '<', cutoffString)
    .del()

  return deletedCount
}

export async function deleteQuotaUsageByUser(
  this: DatabaseService,
  userId: number,
): Promise<number> {
  const deletedCount = await this.knex('quota_usage')
    .where('user_id', userId)
    .del()

  return deletedCount
}

/**
 * Gets the next scheduled maintenance run time from the quota-maintenance schedule
 */
export async function getNextMaintenanceRun(
  this: DatabaseService,
): Promise<Date | undefined> {
  const schedule = await this.getScheduleByName('quota-maintenance')
  if (!schedule || !schedule.enabled) {
    return undefined
  }

  // Return the next_run time if available
  if (
    schedule.next_run &&
    typeof schedule.next_run === 'object' &&
    schedule.next_run.time
  ) {
    return new Date(schedule.next_run.time)
  }

  return undefined
}

/**
 * Gets the start date for weekly rolling quotas based on the most recent reset
 */
export async function getWeeklyRollingStartDate(
  this: DatabaseService,
): Promise<Date> {
  // Get any weekly rolling user and find the most recent reset
  const weeklyQuotas = await this.getUsersWithQuotaType('weekly_rolling')
  if (weeklyQuotas.length === 0) {
    // No weekly rolling users, return fallback
    const fallbackDate = new Date()
    fallbackDate.setDate(fallbackDate.getDate() - 6)
    return fallbackDate
  }

  // Find the most recent reset among all weekly rolling users
  let mostRecentReset: Date | null = null
  for (const quota of weeklyQuotas) {
    const lastReset = await this.getLastQuotaReset(quota.userId)
    if (lastReset) {
      const resetDate = new Date(lastReset)
      if (!mostRecentReset || resetDate > mostRecentReset) {
        mostRecentReset = resetDate
      }
    }
  }

  if (mostRecentReset) {
    return mostRecentReset
  }

  // If no reset found, start from 7 days ago as fallback
  const fallbackDate = new Date()
  fallbackDate.setDate(fallbackDate.getDate() - 6)
  return fallbackDate
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
