import type {
  CreateUserQuotaData,
  EnabledQuotaData,
  QuotaStatus,
  QuotaType,
  QuotaUsage,
  QuotaUsageRow,
  UpdateUserQuotaData,
  UserQuotaConfig,
  UserQuotaConfigs,
  UserQuotaRow,
} from '@root/types/approval.types.js'
import type { DatabaseService } from '@services/database.service.js'
import {
  type QuotaWindow,
  type QuotaWindowSettings,
  quotaResetDate,
  quotaWindow,
  toLocalDateString,
} from '@utils/quota-window.js'
import type { Knex } from 'knex'

/** Upserts an enabled config, deletes a disabled one, and does nothing when the config is undefined */
async function upsertOrDeleteQuota(
  this: DatabaseService,
  trx: Knex.Transaction,
  userId: number,
  contentType: 'movie' | 'show',
  quotaConfig?: EnabledQuotaData,
): Promise<void> {
  if (!quotaConfig) return

  if (
    quotaConfig.enabled &&
    quotaConfig.quotaType &&
    quotaConfig.quotaLimit !== undefined
  ) {
    const quotaData = {
      user_id: userId,
      content_type: contentType,
      quota_type: quotaConfig.quotaType,
      quota_limit: quotaConfig.quotaLimit,
      bypass_approval: quotaConfig.bypassApproval || false,
      watchlist_cap: quotaConfig.watchlistCap ?? null,
      created_at: this.timestamp,
      updated_at: this.timestamp,
    }

    await trx('user_quotas')
      .insert(quotaData)
      .onConflict(['user_id', 'content_type'])
      .merge({
        quota_type: quotaData.quota_type,
        quota_limit: quotaData.quota_limit,
        bypass_approval: quotaData.bypass_approval,
        watchlist_cap: quotaData.watchlist_cap,
        updated_at: quotaData.updated_at,
      })
  } else if (!quotaConfig.enabled) {
    await trx('user_quotas')
      .where({ user_id: userId, content_type: contentType })
      .del()
  }
}

function mapRowToUserQuotaConfig(row: UserQuotaRow): UserQuotaConfig {
  return {
    userId: row.user_id,
    contentType: row.content_type,
    quotaType: row.quota_type,
    quotaLimit: row.quota_limit,
    bypassApproval: Boolean(row.bypass_approval),
    watchlistCap: row.watchlist_cap ?? null,
  }
}

function mapRowToQuotaUsage(row: QuotaUsageRow): QuotaUsage {
  return {
    userId: row.user_id,
    contentType: row.content_type,
    requestDate: row.request_date,
  }
}

function getDateRange(
  quotaType: QuotaType,
  settings: QuotaWindowSettings,
): { start: string; end: string } {
  const today = new Date()
  return {
    start: quotaWindow(quotaType, today, settings).start,
    end: toLocalDateString(today),
  }
}

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
      watchlist_cap: data.watchlistCap ?? null,
      created_at: this.timestamp,
      updated_at: this.timestamp,
    })
    .returning('*')

  return mapRowToUserQuotaConfig(row)
}

export async function createUserQuotas(
  this: DatabaseService,
  quotas: CreateUserQuotaData[],
): Promise<UserQuotaConfig[]> {
  return this.knex.transaction(async (trx) => {
    const created: UserQuotaConfig[] = []
    for (const data of quotas) {
      const [row] = await trx('user_quotas')
        .insert({
          user_id: data.userId,
          content_type: data.contentType,
          quota_type: data.quotaType,
          quota_limit: data.quotaLimit,
          bypass_approval: data.bypassApproval || false,
          watchlist_cap: data.watchlistCap ?? null,
          created_at: this.timestamp,
          updated_at: this.timestamp,
        })
        .returning('*')
      created.push(mapRowToUserQuotaConfig(row))
    }
    return created
  })
}

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
  if (data.watchlistCap !== undefined)
    updateData.watchlist_cap = data.watchlistCap

  const [row] = await this.knex('user_quotas')
    .where('user_id', userId)
    .where('content_type', contentType)
    .update(updateData)
    .returning('*')

  return row ? mapRowToUserQuotaConfig(row) : null
}

/** Returns false when no quota existed */
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

/** Returns false when the user had no quotas */
export async function deleteAllUserQuotas(
  this: DatabaseService,
  userId: number,
): Promise<boolean> {
  const deletedCount = await this.knex('user_quotas')
    .where('user_id', userId)
    .del()
  return deletedCount > 0
}

export async function recordQuotaUsage(
  this: DatabaseService,
  userId: number,
  contentType: 'movie' | 'show',
  requestDate: Date = new Date(),
): Promise<QuotaUsage> {
  const dateString = toLocalDateString(requestDate)

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

/** earliest is the first counted request date as local YYYY-MM-DD, or null when nothing counts */
export async function getCurrentQuotaUsage(
  this: DatabaseService,
  userId: number,
  quotaType: QuotaType,
  settings: QuotaWindowSettings,
  contentType?: 'movie' | 'show',
): Promise<{ count: number; earliest: string | null }> {
  const dateRange = getDateRange(quotaType, settings)
  let query = this.knex('quota_usage')
    .where('user_id', userId)
    .where('request_date', '>=', dateRange.start)
    .where('request_date', '<=', dateRange.end)

  if (contentType) {
    query = query.where('content_type', contentType)
  }

  const result = await query
    .count('* as count')
    .min('request_date as earliest')
    .first()
  return {
    count: Number.parseInt(result?.count as string, 10) || 0,
    earliest: result?.earliest ? String(result.earliest) : null,
  }
}

/** Counts every watchlist item of the type, pending and routed, and is the single source for watchlist cap checks */
export async function getWatchlistUsage(
  this: DatabaseService,
  userId: number,
  contentType: 'movie' | 'show',
): Promise<number> {
  const result = await this.knex('watchlist_items')
    .where('user_id', userId)
    .where('type', contentType)
    .count('* as count')
    .first()
  return Number.parseInt(result?.count as string, 10) || 0
}

export async function getQuotaStatus(
  this: DatabaseService,
  userId: number,
  contentType: 'movie' | 'show',
  settings: QuotaWindowSettings,
): Promise<QuotaStatus | null> {
  const quota = await this.getUserQuota(userId, contentType)
  if (!quota) {
    return null
  }

  const usage = await this.getCurrentQuotaUsage(
    userId,
    quota.quotaType,
    settings,
    contentType,
  )

  const currentUsage = usage.count
  const exceeded = currentUsage >= quota.quotaLimit
  const resetDate = quotaResetDate(
    quota.quotaType,
    quotaWindow(quota.quotaType, new Date(), settings),
    usage.earliest,
    settings,
  )

  let watchlistUsage: number | null = null
  let watchlistCapExceeded = false
  if (quota.watchlistCap != null) {
    watchlistUsage = await getWatchlistUsage.call(this, userId, contentType)
    watchlistCapExceeded = watchlistUsage > quota.watchlistCap
  }

  return {
    quotaType: quota.quotaType,
    quotaLimit: quota.quotaLimit,
    currentUsage,
    exceeded,
    resetDate,
    bypassApproval: quota.bypassApproval,
    watchlistCap: quota.watchlistCap,
    watchlistUsage,
    watchlistCapExceeded,
  }
}

export async function getBulkQuotaStatus(
  this: DatabaseService,
  userIds: number[],
  settings: QuotaWindowSettings,
  contentType?: 'movie' | 'show',
): Promise<Array<{ userId: number; quotaStatus: QuotaStatus | null }>> {
  if (userIds.length === 0) {
    return []
  }

  const quotaQuery = this.knex('user_quotas')
    .whereIn('user_id', userIds)
    .select('*')

  if (contentType) {
    quotaQuery.where('content_type', contentType)
  }

  const quotaRows = await quotaQuery

  const quotaMap = new Map<number, UserQuotaConfig>()
  for (const row of quotaRows) {
    if (!contentType || row.content_type === contentType) {
      quotaMap.set(row.user_id, mapRowToUserQuotaConfig(row))
    }
  }

  const quotasByType = new Map<
    QuotaType,
    Array<{ userId: number; quota: UserQuotaConfig }>
  >()

  for (const userId of userIds) {
    const quota = quotaMap.get(userId)
    if (quota) {
      if (!quotasByType.has(quota.quotaType)) {
        quotasByType.set(quota.quotaType, [])
      }
      quotasByType.get(quota.quotaType)?.push({ userId, quota })
    }
  }

  const usageResults = new Map<number, number>()
  const earliestUsage = new Map<number, string>()
  const windows = new Map<QuotaType, QuotaWindow>()
  const today = new Date()

  for (const [quotaType, quotasOfType] of quotasByType.entries()) {
    const window = quotaWindow(quotaType, today, settings)
    windows.set(quotaType, window)
    const userIdsForType = quotasOfType.map((q) => q.userId)

    let query = this.knex('quota_usage')
      .select('user_id')
      .count('* as count')
      .min('request_date as earliest')
      .whereIn('user_id', userIdsForType)
      .where('request_date', '>=', window.start)
      .where('request_date', '<=', toLocalDateString(today))
      .groupBy('user_id')

    if (contentType) {
      query = query.where('content_type', contentType)
    }

    const usageRows = await query

    for (const row of usageRows) {
      usageResults.set(
        Number(row.user_id),
        Number.parseInt(row.count as string, 10) || 0,
      )
      if (row.earliest) {
        earliestUsage.set(Number(row.user_id), String(row.earliest))
      }
    }

    for (const { userId } of quotasOfType) {
      if (!usageResults.has(userId)) {
        usageResults.set(userId, 0)
      }
    }
  }

  const watchlistUsageResults = new Map<number, number>()
  const usersWithCap = Array.from(quotaMap.entries())
    .filter(([, q]) => q.watchlistCap != null)
    .map(([uid]) => uid)

  if (usersWithCap.length > 0) {
    let watchlistQuery = this.knex('watchlist_items')
      .select('user_id')
      .count('* as count')
      .whereIn('user_id', usersWithCap)
      .groupBy('user_id')

    if (contentType) {
      watchlistQuery = watchlistQuery.where('type', contentType)
    }

    const watchlistRows = await watchlistQuery

    for (const row of watchlistRows) {
      watchlistUsageResults.set(
        Number(row.user_id),
        Number.parseInt(row.count as string, 10) || 0,
      )
    }
  }

  const results: Array<{ userId: number; quotaStatus: QuotaStatus | null }> = []

  for (const userId of userIds) {
    const quota = quotaMap.get(userId)
    if (!quota) {
      results.push({ userId, quotaStatus: null })
      continue
    }

    const currentUsage = usageResults.get(userId) || 0
    const exceeded = currentUsage >= quota.quotaLimit
    const window = windows.get(quota.quotaType)
    const resetDate = window
      ? quotaResetDate(
          quota.quotaType,
          window,
          earliestUsage.get(userId) ?? null,
          settings,
        )
      : null

    const watchlistCap = quota.watchlistCap
    const watchlistUsage =
      watchlistCap != null ? (watchlistUsageResults.get(userId) ?? 0) : null
    const watchlistCapExceeded =
      watchlistCap != null && watchlistUsage != null
        ? watchlistUsage > watchlistCap
        : false

    results.push({
      userId,
      quotaStatus: {
        quotaType: quota.quotaType,
        quotaLimit: quota.quotaLimit,
        currentUsage,
        exceeded,
        resetDate,
        bypassApproval: quota.bypassApproval,
        watchlistCap,
        watchlistUsage,
        watchlistCapExceeded,
      },
    })
  }

  return results
}

export async function getUsersWithQuotas(
  this: DatabaseService,
): Promise<UserQuotaConfig[]> {
  const rows = await this.knex('user_quotas').select('*')
  return rows.map(mapRowToUserQuotaConfig)
}

/** Skips bypass_approval users and caps that are null or zero */
export async function getActiveWatchlistCaps(
  this: DatabaseService,
): Promise<
  Array<{ userId: number; contentType: 'movie' | 'show'; watchlistCap: number }>
> {
  const rows = await this.knex('user_quotas')
    .whereNotNull('watchlist_cap')
    .where('watchlist_cap', '>', 0)
    .where('bypass_approval', false)
    .select('user_id', 'content_type', 'watchlist_cap')

  return rows.map((row) => ({
    userId: row.user_id as number,
    contentType: row.content_type as 'movie' | 'show',
    watchlistCap: row.watchlist_cap as number,
  }))
}

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
    query = query.where('request_date', '>=', toLocalDateString(startDate))
  }

  if (endDate) {
    query = query.where('request_date', '<=', toLocalDateString(endDate))
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

export async function getQuotaUsageHistoryCount(
  this: DatabaseService,
  userId: number,
  startDate?: Date,
  endDate?: Date,
  contentType?: 'movie' | 'show',
): Promise<number> {
  let query = this.knex('quota_usage').where('user_id', userId)

  if (startDate) {
    query = query.where('request_date', '>=', toLocalDateString(startDate))
  }

  if (endDate) {
    query = query.where('request_date', '<=', toLocalDateString(endDate))
  }

  if (contentType) {
    query = query.where('content_type', contentType)
  }

  const result = await query.count('* as count').first()
  return Number.parseInt(result?.count as string, 10) || 0
}

/** Returns one zero-filled row per day for the last `days` days, newest first */
export async function getDailyUsageStats(
  this: DatabaseService,
  userId: number,
  days = 30,
): Promise<{ date: string; movies: number; shows: number; total: number }[]> {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(endDate.getDate() - days)

  const startDateString = toLocalDateString(startDate)
  const endDateString = toLocalDateString(endDate)

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

  for (let i = 0; i < days; i++) {
    const date = new Date(endDate)
    date.setDate(date.getDate() - i)
    const dateString = toLocalDateString(date)
    statsMap.set(dateString, {
      date: dateString,
      movies: 0,
      shows: 0,
      total: 0,
    })
  }

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

export async function cleanupOldQuotaUsage(
  this: DatabaseService,
  olderThanDays = 90,
): Promise<number> {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)
  const cutoffString = toLocalDateString(cutoffDate)

  const deletedCount = await this.knex('quota_usage')
    .where('request_date', '<', cutoffString)
    .del()

  return deletedCount
}

export async function getUsersWithQuotaType(
  this: DatabaseService,
  quotaType: QuotaType,
): Promise<UserQuotaConfig[]> {
  const rows = await this.knex('user_quotas')
    .where('quota_type', quotaType)
    .select('*')
  return rows.map(mapRowToUserQuotaConfig)
}

export async function bulkDeleteQuotas(
  this: DatabaseService,
  userIds: number[],
): Promise<{ processedCount: number; failedIds: number[] }> {
  const failedIds: number[] = []
  let processedCount = 0

  try {
    await this.knex.transaction(async (trx) => {
      const BATCH_SIZE = 50
      for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
        const batchIds = userIds.slice(i, i + BATCH_SIZE)

        try {
          await trx('user_quotas').whereIn('user_id', batchIds).del()

          await trx('quota_usage').whereIn('user_id', batchIds).del()

          processedCount += batchIds.length
        } catch (batchError) {
          this.log.error(`Error deleting quota batch: ${batchError}`)
          failedIds.push(...batchIds)
        }
      }
    })
  } catch (error) {
    this.log.error(`Error in bulk quota deletion transaction: ${error}`)
    return { processedCount: 0, failedIds: userIds }
  }

  this.log.info(
    `Bulk deleted quotas for ${processedCount} users, ${failedIds.length} failed`,
  )
  return { processedCount, failedIds }
}

/** An undefined movieQuota or showQuota leaves that content type untouched */
export async function bulkUpdateQuotas(
  this: DatabaseService,
  userIds: number[],
  movieQuota?: EnabledQuotaData,
  showQuota?: EnabledQuotaData,
): Promise<{ processedCount: number; failedIds: number[] }> {
  const failedIds: number[] = []
  let processedCount = 0

  try {
    await this.knex.transaction(async (trx) => {
      const BATCH_SIZE = 50
      for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
        const batchIds = userIds.slice(i, i + BATCH_SIZE)

        try {
          for (const userId of batchIds) {
            await upsertOrDeleteQuota.call(
              this,
              trx,
              userId,
              'movie',
              movieQuota,
            )
            await upsertOrDeleteQuota.call(this, trx, userId, 'show', showQuota)
          }

          processedCount += batchIds.length
        } catch (batchError) {
          this.log.error(`Error updating quota batch: ${batchError}`)
          failedIds.push(...batchIds)
        }
      }
    })
  } catch (error) {
    this.log.error(`Error in bulk quota update transaction: ${error}`)
    return { processedCount: 0, failedIds: userIds }
  }

  this.log.info(
    `Bulk updated quotas for ${processedCount} users, ${failedIds.length} failed`,
  )
  return { processedCount, failedIds }
}

/** Checks the period limit and records usage in one transaction, so concurrent callers cannot both pass */
export async function tryConsumeQuota(
  this: DatabaseService,
  userId: number,
  contentType: 'movie' | 'show',
  quotaType: QuotaType,
  quotaLimit: number,
  settings: QuotaWindowSettings,
  requestDate: Date = new Date(),
): Promise<{
  consumed: boolean
  currentUsage: number
}> {
  const dateString = toLocalDateString(requestDate)
  const dateRange = getDateRange(quotaType, settings)

  return await this.knex.transaction(async (trx) => {
    // Postgres needs the row lock to serialize concurrent consumers, SQLite already serializes writes
    if (this.isPostgres) {
      await trx('user_quotas')
        .where('user_id', userId)
        .where('content_type', contentType)
        .forUpdate()
        .first()
    }

    const result = await trx('quota_usage')
      .where('user_id', userId)
      .where('content_type', contentType)
      .where('request_date', '>=', dateRange.start)
      .where('request_date', '<=', dateRange.end)
      .count('* as count')
      .first()

    const currentUsage = Number.parseInt(result?.count as string, 10) || 0

    if (currentUsage >= quotaLimit) {
      return { consumed: false, currentUsage }
    }

    await trx('quota_usage').insert({
      user_id: userId,
      content_type: contentType,
      request_date: dateString,
      created_at: this.timestamp,
    })

    return { consumed: true, currentUsage: currentUsage + 1 }
  })
}
