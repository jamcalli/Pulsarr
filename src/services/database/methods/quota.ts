import type { DatabaseService } from '@services/database.service.js'
import type {
  UserQuotaConfig,
  UserQuotaConfigs,
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
 * Converts a user quota database row into a UserQuotaConfig object.
 *
 * @param row - The database row representing a user quota configuration
 * @returns The corresponding UserQuotaConfig object
 */
function mapRowToUserQuotaConfig(row: UserQuotaRow): UserQuotaConfig {
  return {
    userId: row.user_id,
    contentType: row.content_type,
    quotaType: row.quota_type,
    quotaLimit: row.quota_limit,
    bypassApproval: Boolean(row.bypass_approval),
  }
}

/**
 * Converts a quota usage database row into a QuotaUsage object.
 *
 * @param row - The database row representing a quota usage entry
 * @returns The corresponding QuotaUsage object
 */
function mapRowToQuotaUsage(row: QuotaUsageRow): QuotaUsage {
  return {
    userId: row.user_id,
    contentType: row.content_type,
    requestDate: row.request_date,
  }
}

/**
 * Returns the start and end date strings for quota calculations based on the specified quota type.
 *
 * For 'daily', both start and end are set to the current local date. For 'weekly_rolling', the start is set to seven days ago (including today). For 'monthly', the start is the first day of the current month. The end date is always the current local date.
 *
 * @returns An object containing the start and end date strings for the quota period.
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
      throw new Error(`Unsupported quota type: ${quotaType}`)
    }
  }

  return { start, end }
}

/**
 * Returns the next scheduled reset date for the specified quota type, based on the maintenance schedule.
 *
 * For 'daily', 'monthly', and 'weekly_rolling' quota types, the reset date is determined by the next maintenance run. Returns undefined for unknown quota types.
 *
 * @returns The next reset date, or undefined if not applicable.
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
 * Inserts a new quota configuration for a user and content type into the database.
 *
 * @param data - The quota configuration details to create, including user ID, content type, quota type, limit, and optional bypass approval flag.
 * @returns The created user quota configuration object.
 */
export async function createUserQuota(
  this: DatabaseService,
  data: CreateUserQuotaData,
): Promise<UserQuotaConfig> {
  const [row] = await this.knex('user_quotas')
    .insert({
      user_id: data.userId,
      content_type: data.contentType,
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
 * Retrieves the quota configuration for a user and content type.
 *
 * @returns The user's quota configuration for the specified content type, or null if none exists.
 */
export async function getUserQuota(
  this: DatabaseService,
  userId: number,
  contentType: 'movie' | 'show',
): Promise<UserQuotaConfig | null> {
  const row = await this.knex('user_quotas')
    .where('user_id', userId)
    .where('content_type', contentType)
    .first()
  return row ? mapRowToUserQuotaConfig(row) : null
}

/**
 * Retrieves all quota configurations for a user, returning both movie and show quotas if available.
 *
 * @param userId - The ID of the user whose quota configurations are being retrieved
 * @returns An object containing the user's ID and optional movie and show quota configurations
 */
export async function getUserQuotas(
  this: DatabaseService,
  userId: number,
): Promise<UserQuotaConfigs> {
  const rows = await this.knex('user_quotas')
    .where('user_id', userId)
    .select('*')

  const movieQuota = rows.find((row) => row.content_type === 'movie')
  const showQuota = rows.find((row) => row.content_type === 'show')

  return {
    userId,
    movieQuota: movieQuota ? mapRowToUserQuotaConfig(movieQuota) : undefined,
    showQuota: showQuota ? mapRowToUserQuotaConfig(showQuota) : undefined,
  }
}

/**
 * Updates the quota configuration for a user and content type with the provided data.
 *
 * @param userId - The ID of the user whose quota is being updated
 * @param contentType - The content type ('movie' or 'show') for which the quota applies
 * @param data - The fields to update in the user's quota configuration
 * @returns The updated user quota configuration, or null if no matching record was found
 */
export async function updateUserQuota(
  this: DatabaseService,
  userId: number,
  contentType: 'movie' | 'show',
  data: UpdateUserQuotaData,
): Promise<UserQuotaConfig | null> {
  const updateData: Partial<UserQuotaRow> = {
    updated_at: this.timestamp,
  }

  if (data.contentType !== undefined) updateData.content_type = data.contentType
  if (data.quotaType !== undefined) updateData.quota_type = data.quotaType
  if (data.quotaLimit !== undefined) updateData.quota_limit = data.quotaLimit
  if (data.bypassApproval !== undefined)
    updateData.bypass_approval = data.bypassApproval

  const [row] = await this.knex('user_quotas')
    .where('user_id', userId)
    .where('content_type', contentType)
    .update(updateData)
    .returning('*')

  return row ? mapRowToUserQuotaConfig(row) : null
}

/**
 * Deletes a user's quota configuration for a specific content type.
 *
 * @param userId - The ID of the user whose quota configuration will be deleted
 * @param contentType - The content type ('movie' or 'show') for which the quota configuration will be deleted
 * @returns True if a quota configuration was deleted, otherwise false
 */
export async function deleteUserQuota(
  this: DatabaseService,
  userId: number,
  contentType: 'movie' | 'show',
): Promise<boolean> {
  const deletedCount = await this.knex('user_quotas')
    .where('user_id', userId)
    .where('content_type', contentType)
    .del()
  return deletedCount > 0
}

/**
 * Removes all quota configurations associated with a specific user.
 *
 * @param userId - The ID of the user whose quota configurations will be deleted
 * @returns True if any quota configurations were deleted, otherwise false
 */
export async function deleteAllUserQuotas(
  this: DatabaseService,
  userId: number,
): Promise<boolean> {
  const deletedCount = await this.knex('user_quotas')
    .where('user_id', userId)
    .del()
  return deletedCount > 0
}

/**
 * Inserts a quota usage record for a user and content type at the specified or current date.
 *
 * @param userId - The ID of the user whose usage is being recorded
 * @param contentType - The type of content for which the quota usage is recorded ('movie' or 'show')
 * @param requestDate - The date of the quota usage; defaults to the current date if not provided
 * @returns The recorded quota usage entry
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
 * Returns the number of quota usage records for a user within the current quota period.
 *
 * Counts usage entries for the specified user and quota type, optionally filtered by content type, within the relevant date range for the quota period.
 *
 * @returns The count of usage records for the user in the current quota period
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
 * Retrieves the quota status for a user and content type, including current usage, limit, whether the quota is exceeded, reset date, and bypass approval flag.
 *
 * @param userId - The ID of the user whose quota status is being retrieved
 * @param contentType - The content type ('movie' or 'show') for which to check the quota
 * @returns The quota status object if a quota configuration exists, or null if not found
 */
export async function getQuotaStatus(
  this: DatabaseService,
  userId: number,
  contentType: 'movie' | 'show',
): Promise<QuotaStatus | null> {
  const quota = await this.getUserQuota(userId, contentType)
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
 * Retrieves quota status for multiple users in a single batch operation.
 *
 * For each user ID, returns the user's quota configuration and current usage for the specified content type (if provided), including whether the quota is exceeded and the next reset date. Users without a quota configuration receive a `null` quota status.
 *
 * @param userIds - Array of user IDs to check quota status for
 * @param contentType - Optional content type to filter quotas and usage ('movie' or 'show')
 * @returns An array of objects containing each user ID and their corresponding quota status or null if no quota is configured
 */
export async function getBulkQuotaStatus(
  this: DatabaseService,
  userIds: number[],
  contentType?: 'movie' | 'show',
): Promise<Array<{ userId: number; quotaStatus: QuotaStatus | null }>> {
  if (userIds.length === 0) {
    return []
  }

  // Get quota configurations for the requested users, filtered by content type if specified
  const quotaQuery = this.knex('user_quotas')
    .whereIn('user_id', userIds)
    .select('*')

  if (contentType) {
    quotaQuery.where('content_type', contentType)
  }

  const quotaRows = await quotaQuery

  const quotaMap = new Map<number, UserQuotaConfig>()
  for (const row of quotaRows) {
    // If contentType is specified, only map matching quotas
    if (!contentType || row.content_type === contentType) {
      quotaMap.set(row.user_id, mapRowToUserQuotaConfig(row))
    }
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
 * Determines if a user's quota has been exceeded for a specific content type.
 *
 * Returns a `QuotaExceeded` object with details if the quota is exceeded, or `null` if not exceeded or if no content type is provided.
 *
 * @returns A `QuotaExceeded` object if the quota is exceeded, otherwise `null`.
 */
export async function checkQuotaExceeded(
  this: DatabaseService,
  userId: number,
  contentType?: 'movie' | 'show',
): Promise<QuotaExceeded | null> {
  if (!contentType) {
    return null
  }

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
 * Retrieves all user quota configurations from the database.
 *
 * @returns An array of user quota configuration objects.
 */
export async function getUsersWithQuotas(
  this: DatabaseService,
): Promise<UserQuotaConfig[]> {
  const rows = await this.knex('user_quotas').select('*')
  return rows.map(mapRowToUserQuotaConfig)
}

/**
 * Retrieves a user's quota usage records filtered by optional date range, content type, and pagination.
 *
 * @param userId - The ID of the user whose quota usage history is requested
 * @param startDate - Optional start date to filter usage records (inclusive)
 * @param endDate - Optional end date to filter usage records (inclusive)
 * @param contentType - Optional content type filter ('movie' or 'show')
 * @param limit - Maximum number of records to return (default: 50)
 * @param offset - Number of records to skip for pagination (default: 0)
 * @returns An array of quota usage records matching the specified filters
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
 * Returns the total number of quota usage records for a user, optionally filtered by date range and content type.
 *
 * @param userId - The ID of the user whose quota usage records are counted
 * @param startDate - Optional start date to filter records from this date onward
 * @param endDate - Optional end date to filter records up to this date
 * @param contentType - Optional content type ('movie' or 'show') to filter records
 * @returns The count of matching quota usage records
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
 * Returns daily aggregated usage statistics for a user over a specified number of days.
 *
 * Each entry includes the date, counts of movies and shows used, and the total usage for that day.
 *
 * @param userId - The ID of the user whose usage statistics are retrieved
 * @param days - The number of days to include in the statistics (default is 30)
 * @returns An array of objects containing the date, movies count, shows count, and total usage per day, sorted by date descending
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
 * Deletes quota usage records older than the specified number of days.
 *
 * @param olderThanDays - The age threshold in days; records older than this will be deleted (default is 90)
 * @returns The number of quota usage records deleted
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

/**
 * Deletes all quota usage records for a specific user.
 *
 * @param userId - The ID of the user whose quota usage records will be deleted
 * @returns The number of quota usage records deleted
 */
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
 * Retrieves the next scheduled maintenance run time for quota maintenance, if enabled.
 *
 * @returns The date and time of the next maintenance run, or undefined if not scheduled or disabled.
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
 * Returns the start date for a weekly rolling quota period, representing 7 days ago including today.
 *
 * @returns The Date object marking the beginning of the current 7-day rolling window.
 */
export async function getWeeklyRollingStartDate(
  this: DatabaseService,
): Promise<Date> {
  // Weekly rolling quotas use a simple 7-day rolling window
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 6) // 7 days total including today
  return startDate
}

/**
 * Retrieves all user quota configurations that match the specified quota type.
 *
 * @param quotaType - The quota type to filter user quota configurations by
 * @returns An array of user quota configuration objects with the given quota type
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
 * Retrieves the most recent quota usage record for a user.
 *
 * @param userId - The ID of the user whose latest quota usage is requested
 * @returns The latest quota usage record for the user, or null if none exists
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
