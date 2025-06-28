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
 * Calculates the start and end date strings for a quota period based on the given quota type.
 *
 * For 'daily', both start and end are set to the current local date. For 'weekly_rolling', the start is seven days ago (including today). For 'monthly', the start is the first day of the current month. The end date is always the current local date.
 *
 * @returns An object with `start` and `end` date strings representing the quota period.
 * @throws If an unsupported quota type is provided.
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
 * Retrieves the next reset date for a given quota type based on the maintenance schedule.
 *
 * For 'daily', 'monthly', and 'weekly_rolling' quota types, returns the date of the next scheduled maintenance run. Returns undefined for unsupported quota types.
 *
 * @returns The next reset date, or undefined if the quota type is not recognized.
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
 * Creates a new user quota configuration for a specific content type.
 *
 * @param data - The details for the new quota configuration, including user ID, content type, quota type, limit, and optional bypass approval flag.
 * @returns The newly created user quota configuration.
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
 * Returns the quota configuration for a user and content type, or null if not found.
 *
 * @returns The quota configuration for the specified user and content type, or null if none exists.
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
 * Retrieves all quota configurations for a user, including separate configurations for movies and shows if present.
 *
 * @param userId - The user ID to fetch quota configurations for
 * @returns An object containing the user ID and the user's movie and show quota configurations, if available
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
 * Updates a user's quota configuration for a specific content type with new values.
 *
 * @param userId - The user whose quota configuration will be updated
 * @param contentType - The content type ('movie' or 'show') for which the quota applies
 * @param data - The fields to update in the quota configuration
 * @returns The updated quota configuration, or null if no matching record exists
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
 * Removes the quota configuration for a user and specified content type.
 *
 * @param userId - The user ID whose quota configuration should be removed
 * @param contentType - The content type ('movie' or 'show') associated with the quota configuration
 * @returns True if a quota configuration was removed; false if none existed
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
 * Deletes all quota configurations for the specified user.
 *
 * @param userId - The ID of the user whose quota configurations are to be removed
 * @returns True if one or more quota configurations were deleted; otherwise, false
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
 * Records a quota usage entry for a user and content type on a specified or current date.
 *
 * @param userId - The user ID for whom the usage is recorded
 * @param contentType - The content type ('movie' or 'show') associated with the usage
 * @param requestDate - The date of usage; uses the current date if not provided
 * @returns The created quota usage record
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
 * Counts the number of quota usage records for a user within the current quota period.
 *
 * Calculates usage for the specified user and quota type, optionally filtered by content type, based on the relevant date range for the quota period.
 *
 * @returns The number of usage records for the user in the current quota period
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
 * Retrieves the current quota status for a user and content type.
 *
 * Returns an object containing the quota type, usage limit, current usage count, whether the quota is exceeded, the next reset date (if available), and the bypass approval flag. Returns null if no quota configuration exists for the user and content type.
 *
 * @param userId - The user ID to check quota status for
 * @param contentType - The content type ('movie' or 'show') to check
 * @returns The quota status object, or null if no quota configuration is found
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
 * For each user ID, returns the user's quota status for the specified content type, including current usage, limit, exceeded flag, next reset date, and bypass approval flag. If a user has no quota configuration, their quota status is `null`.
 *
 * @param userIds - List of user IDs to retrieve quota status for
 * @param contentType - Optional content type to filter by ('movie' or 'show')
 * @returns An array of objects with each user ID and their corresponding quota status or null if not configured
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
 * Checks whether a user's quota has been exceeded for the specified content type.
 *
 * Returns a `QuotaExceeded` object with quota type, limit, usage, and exceeded flag if the quota is exceeded; otherwise returns `null`. If no content type is provided, always returns `null`.
 *
 * @returns A `QuotaExceeded` object if the user's quota is exceeded for the given content type, or `null` if not exceeded or if content type is not specified.
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
 * Retrieves all user quota configurations.
 *
 * @returns An array of all user quota configuration objects in the system.
 */
export async function getUsersWithQuotas(
  this: DatabaseService,
): Promise<UserQuotaConfig[]> {
  const rows = await this.knex('user_quotas').select('*')
  return rows.map(mapRowToUserQuotaConfig)
}

/**
 * Retrieves quota usage records for a user, optionally filtered by date range, content type, and paginated.
 *
 * @param userId - The user ID to retrieve usage history for
 * @param startDate - If provided, only records on or after this date are included
 * @param endDate - If provided, only records on or before this date are included
 * @param contentType - If provided, filters records by content type ('movie' or 'show')
 * @param limit - Maximum number of records to return (default: 50)
 * @param offset - Number of records to skip for pagination (default: 0)
 * @returns An array of quota usage records matching the filters
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
 * Counts the number of quota usage records for a user, with optional filtering by date range and content type.
 *
 * @param userId - The user ID to count usage records for
 * @param startDate - If provided, only records on or after this date are counted
 * @param endDate - If provided, only records on or before this date are counted
 * @param contentType - If provided, only records matching this content type ('movie' or 'show') are counted
 * @returns The total count of matching quota usage records
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
 * Retrieves daily aggregated quota usage statistics for a user over a specified number of days.
 *
 * Each result includes the date, the number of movies and shows used, and the total usage for that day. Days with no usage are included with zero counts. Results are sorted by date in descending order.
 *
 * @param userId - The user ID for which to retrieve usage statistics
 * @param days - The number of days to include in the statistics window (default is 30)
 * @returns An array of objects with date, movies count, shows count, and total usage per day
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
 * Removes quota usage records that are older than the specified number of days.
 *
 * @param olderThanDays - The minimum age in days for records to be deleted; defaults to 90 if not specified.
 * @returns The count of quota usage records removed.
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
 * Deletes all quota usage records associated with the specified user.
 *
 * @param userId - The user ID for which all quota usage records will be removed
 * @returns The total number of deleted quota usage records
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
 * Calculates the start date of the current 7-day rolling window for weekly quotas.
 *
 * @returns The Date marking the beginning of the 7-day period, including today.
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
 * Retrieves all user quota configurations for users with the specified quota type.
 *
 * @param quotaType - The type of quota to filter by
 * @returns An array of user quota configurations matching the quota type
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
 * Returns the most recent quota usage entry for the specified user, or null if no usage records exist.
 *
 * @param userId - The user ID to look up
 * @returns The latest quota usage record for the user, or null if not found
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
