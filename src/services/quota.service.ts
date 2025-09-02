import type {
  CreateUserQuotaData,
  QuotaStatus,
  QuotaType,
  UpdateUserQuotaData,
  UserQuotaConfig,
  UserQuotaConfigs,
} from '@root/types/approval.types.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

export class QuotaService {
  private get log(): FastifyBaseLogger {
    return createServiceLogger(this.fastify.log, 'QUOTA')
  }

  constructor(private fastify: FastifyInstance) {}

  /**
   * Log scheduled job execution with proper service prefix
   */
  logScheduledJob(action: 'start' | 'complete', jobName: string): void {
    this.log.info(
      { jobName, action },
      action === 'start' ? 'Running scheduled job' : 'Completed scheduled job',
    )
  }

  /**
   * Creates quotas for a user with specified settings (manual creation)
   */
  async createUserQuotas(
    userId: number,
    quotaType: QuotaType,
    quotaLimit: number,
    bypassApproval = false,
  ): Promise<UserQuotaConfigs> {
    const movieData: CreateUserQuotaData = {
      userId,
      contentType: 'movie',
      quotaType,
      quotaLimit,
      bypassApproval,
    }

    const showData: CreateUserQuotaData = {
      userId,
      contentType: 'show',
      quotaType,
      quotaLimit,
      bypassApproval,
    }

    const [movieQuota, showQuota] = await Promise.all([
      this.fastify.db.createUserQuota(movieData),
      this.fastify.db.createUserQuota(showData),
    ])

    return {
      userId,
      movieQuota: movieQuota || undefined,
      showQuota: showQuota || undefined,
    }
  }

  /**
   * Sets up default quotas for a new user based on config settings
   */
  async setupDefaultQuotas(userId: number): Promise<UserQuotaConfigs> {
    const config = this.fastify.config
    let movieQuota: UserQuotaConfig | null = null
    let showQuota: UserQuotaConfig | null = null

    // Create movie quota if enabled in config
    if (config.newUserDefaultMovieQuotaEnabled) {
      const movieData: CreateUserQuotaData = {
        userId,
        contentType: 'movie',
        quotaType: config.newUserDefaultMovieQuotaType ?? 'monthly',
        quotaLimit: config.newUserDefaultMovieQuotaLimit ?? 10,
        bypassApproval: config.newUserDefaultMovieBypassApproval ?? false,
      }
      movieQuota = await this.fastify.db.createUserQuota(movieData)
    }

    // Create show quota if enabled in config
    if (config.newUserDefaultShowQuotaEnabled) {
      const showData: CreateUserQuotaData = {
        userId,
        contentType: 'show',
        quotaType: config.newUserDefaultShowQuotaType ?? 'monthly',
        quotaLimit: config.newUserDefaultShowQuotaLimit ?? 10,
        bypassApproval: config.newUserDefaultShowBypassApproval ?? false,
      }
      showQuota = await this.fastify.db.createUserQuota(showData)
    }

    return {
      userId,
      movieQuota: movieQuota || undefined,
      showQuota: showQuota || undefined,
    }
  }

  /**
   * Validates quota limits and settings
   */
  validateQuotaData(data: CreateUserQuotaData | UpdateUserQuotaData): {
    valid: boolean
    errors: string[]
  } {
    const errors: string[] = []

    if ('quotaLimit' in data && data.quotaLimit !== undefined) {
      if (data.quotaLimit < 0) {
        errors.push('Quota limit cannot be negative')
      }
      if (data.quotaLimit > 1000) {
        errors.push('Quota limit cannot exceed 1000')
      }
    }

    // Reset day validation removed - quotas now reset based on maintenance schedule

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  /**
   * Gets the current quota status for a user
   */
  async getUserQuotaStatus(
    userId: number,
    contentType: 'movie' | 'show',
  ): Promise<QuotaStatus | null> {
    return this.fastify.db.getQuotaStatus(userId, contentType)
  }

  /**
   * Checks if a user would exceed quota with a new request
   */
  async wouldExceedQuota(
    userId: number,
    contentType: 'movie' | 'show',
  ): Promise<boolean> {
    const status = await this.fastify.db.getQuotaStatus(userId, contentType)
    if (!status) {
      return false // No quota configured
    }

    if (status.bypassApproval) {
      return false // User bypasses quotas
    }

    return status.currentUsage >= status.quotaLimit
  }

  /**
   * Calculates how many requests a user can make before hitting quota
   */
  async getRemainingQuota(
    userId: number,
    contentType?: 'movie' | 'show',
  ): Promise<number> {
    if (!contentType) {
      return Number.POSITIVE_INFINITY // No content type specified
    }

    const status = await this.fastify.db.getQuotaStatus(userId, contentType)
    if (!status) {
      return Number.POSITIVE_INFINITY // No quota configured
    }

    if (status.bypassApproval) {
      return Number.POSITIVE_INFINITY // User bypasses quotas
    }

    return Math.max(0, status.quotaLimit - status.currentUsage)
  }

  /**
   * Gets formatted quota status for display
   */
  async getFormattedQuotaStatus(
    userId: number,
    contentType?: 'movie' | 'show',
  ): Promise<{
    status: QuotaStatus | null
    displayText: string
    warningLevel: 'none' | 'warning' | 'danger'
  }> {
    if (!contentType) {
      return {
        status: null,
        displayText: 'No content type specified',
        warningLevel: 'none',
      }
    }

    const status = await this.fastify.db.getQuotaStatus(userId, contentType)

    if (!status) {
      return {
        status: null,
        displayText: 'No quota configured',
        warningLevel: 'none',
      }
    }

    if (status.bypassApproval) {
      return {
        status,
        displayText: 'Unlimited (quota bypass enabled)',
        warningLevel: 'none',
      }
    }

    const _remaining = status.quotaLimit - status.currentUsage
    const percentageRaw =
      status.quotaLimit > 0
        ? (status.currentUsage / status.quotaLimit) * 100
        : 100
    const percentage = Math.max(0, Math.min(100, percentageRaw))

    this.log.debug(
      {
        userId,
        contentType,
        remaining: _remaining,
        used: status.currentUsage,
        limit: status.quotaLimit,
        percentage,
        overBy: Math.max(0, status.currentUsage - status.quotaLimit),
      },
      'Quota calculation details',
    )

    let displayText =
      status.quotaLimit === 0
        ? `${status.currentUsage}/0 used (limit 0)`
        : `${status.currentUsage}/${status.quotaLimit} used`
    if (status.resetDate) {
      displayText += ` (resets ${new Date(status.resetDate).toLocaleDateString()})`
    }

    let warningLevel: 'none' | 'warning' | 'danger' = 'none'
    if (percentage >= 100) {
      warningLevel = 'danger'
    } else if (percentage >= 80) {
      warningLevel = 'warning'
    }

    return {
      status,
      displayText,
      warningLevel,
    }
  }

  /**
   * Bulk updates quota settings for multiple users
   */
  async bulkUpdateQuotas(
    userIds: number[],
    updates: UpdateUserQuotaData,
  ): Promise<{
    updated: number
    failed: number[]
    errors: string[]
  }> {
    const validation = this.validateQuotaData(updates)
    if (!validation.valid) {
      return {
        updated: 0,
        failed: userIds,
        errors: validation.errors,
      }
    }

    const results = {
      updated: 0,
      failed: [] as number[],
      errors: [] as string[],
    }

    for (const userId of userIds) {
      try {
        // Update both movie and show quotas
        const [movieResult, showResult] = await Promise.all([
          this.fastify.db
            .updateUserQuota(userId, 'movie', updates)
            .catch(() => null),
          this.fastify.db
            .updateUserQuota(userId, 'show', updates)
            .catch(() => null),
        ])

        if (movieResult || showResult) {
          results.updated++
        } else {
          results.failed.push(userId)
          results.errors.push(`User ${userId} quotas not found`)
        }
      } catch (error) {
        results.failed.push(userId)
        results.errors.push(
          `User ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
      }
    }

    return results
  }

  /**
   * Resets quota usage for users (useful for manual resets)
   */
  async resetQuotaUsage(
    userIds: number[],
    fromDate?: Date,
  ): Promise<{
    usersProcessed: number
    recordsDeleted: number
    errors: string[]
  }> {
    const errors: string[] = []
    let usersProcessed = 0
    let totalRecordsDeleted = 0

    for (const userId of userIds) {
      try {
        // Delete quota usage records for this user
        const deletedCount = fromDate
          ? await this.fastify.db.deleteQuotaUsageByUserSince(userId, fromDate)
          : await this.fastify.db.deleteQuotaUsageByUser(userId)
        if (deletedCount === 0) {
          this.log.debug({ userId, fromDate }, 'No quota usage to reset')
          continue
        }

        this.log.info(
          { deletedCount, userId, fromDate },
          'Reset quota usage records',
        )

        usersProcessed++
        totalRecordsDeleted += deletedCount
      } catch (error) {
        errors.push(
          `User ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
      }
    }

    return {
      usersProcessed,
      recordsDeleted: totalRecordsDeleted,
      errors,
    }
  }

  /**
   * Performs maintenance tasks like cleanup of old quota usage records
   */
  async performMaintenance(): Promise<void> {
    try {
      await this.performAllQuotaMaintenance()
    } catch (error) {
      this.log.error({ error }, 'Failed to perform quota maintenance:')
    }
  }

  /**
   * Performs quota maintenance - primarily cleanup of old usage records
   *
   * This runs on the admin-configured schedule and handles:
   * - Cleanup of old usage records (if enabled in configuration)
   * - Logging of quota status for monitoring
   *
   * Note: Quotas automatically "reset" via date range calculations, no manual reset needed.
   */
  async performAllQuotaMaintenance(): Promise<void> {
    const now = new Date()
    const config = this.fastify.config?.quotaSettings

    // Log quota status for monitoring
    await this.logQuotaStatus(now)

    // Cleanup old quota usage records based on configuration
    if (config?.cleanup?.enabled !== false) {
      const retentionDays = config?.cleanup?.retentionDays ?? 90
      const cleanedCount =
        await this.fastify.db.cleanupOldQuotaUsage(retentionDays)
      if (cleanedCount > 0) {
        this.log.info(
          { cleanedCount, retentionDays },
          'Cleaned up old quota usage records',
        )
      }
    } else {
      const retentionDays = config?.cleanup?.retentionDays ?? 90
      this.log.debug(
        { retentionDays },
        'Quota cleanup disabled by configuration',
      )
    }
  }

  /**
   * Logs quota maintenance run for monitoring purposes
   */
  private async logQuotaStatus(_now: Date): Promise<void> {
    try {
      const [dailyQuotas, weeklyQuotas, monthlyQuotas] = await Promise.all([
        this.fastify.db.getUsersWithQuotaType('daily'),
        this.fastify.db.getUsersWithQuotaType('weekly_rolling'),
        this.fastify.db.getUsersWithQuotaType('monthly'),
      ])

      const totalQuotas =
        dailyQuotas.length + weeklyQuotas.length + monthlyQuotas.length

      if (totalQuotas > 0) {
        this.log.info(
          {
            daily: dailyQuotas.length,
            weekly: weeklyQuotas.length,
            monthly: monthlyQuotas.length,
            total: totalQuotas,
            at: _now,
          },
          'Quota maintenance completed',
        )
      } else {
        this.log.debug(
          { total: 0, at: _now },
          'No active quotas found during maintenance',
        )
      }
    } catch (error) {
      this.log.error({ error }, 'Failed to log quota status:')
    }
  }

  /**
   * Gets quota analytics for reporting
   */
  async getQuotaAnalytics(): Promise<{
    totalUsers: number
    usersWithQuotas: number
    averageQuotaLimit: number
    topQuotaUsers: Array<{
      userId: number
      userName: string
      quotaLimit: number
      currentUsage: number
    }>
  }> {
    const [allUsers, usersWithQuotas] = await Promise.all([
      this.fastify.db.getAllUsers(),
      this.fastify.db.getUsersWithQuotas(),
    ])

    const totalQuotaLimit = usersWithQuotas.reduce(
      (sum, quota) => sum + quota.quotaLimit,
      0,
    )
    const averageQuotaLimit =
      usersWithQuotas.length > 0 ? totalQuotaLimit / usersWithQuotas.length : 0

    // Get top quota users with current usage and user names
    const topQuotaUsers: Array<{
      userId: number
      userName: string
      quotaLimit: number
      currentUsage: number
    }> = []

    if (usersWithQuotas.length > 0) {
      const userIds = usersWithQuotas.map((quota) => quota.userId)
      const quotaStatuses = await this.fastify.db.getBulkQuotaStatus(userIds)

      for (const { userId, quotaStatus } of quotaStatuses) {
        if (quotaStatus) {
          const user = await this.fastify.db.getUser(userId)
          if (user) {
            topQuotaUsers.push({
              userId,
              userName: user.name,
              quotaLimit: quotaStatus.quotaLimit,
              currentUsage: quotaStatus.currentUsage,
            })
          }
        }
      }

      // Sort by quota limit descending and take top 10
      topQuotaUsers.sort((a, b) => b.quotaLimit - a.quotaLimit)
      topQuotaUsers.splice(10) // Keep only top 10
    }

    return {
      totalUsers: allUsers.length,
      usersWithQuotas: usersWithQuotas.length,
      averageQuotaLimit: Math.round(averageQuotaLimit * 100) / 100,
      topQuotaUsers,
    }
  }

  /**
   * Records quota usage for a user
   * This is the proper service layer method for recording quota usage
   */
  async recordUsage(
    userId: number,
    contentType: 'movie' | 'show',
    requestDate: Date = new Date(),
  ): Promise<boolean> {
    try {
      // Check if user has quota configured for this content type
      const userQuota = await this.fastify.db.getUserQuota(userId, contentType)
      if (!userQuota) {
        // No quota configured for user, don't record
        return false
      }

      // Record the usage
      await this.fastify.db.recordQuotaUsage(userId, contentType, requestDate)
      return true
    } catch (error) {
      // Log error but don't throw - quota recording failures shouldn't break routing
      this.log.error(
        { error, userId, contentType, requestDate },
        'Error recording quota usage',
      )
      return false
    }
  }
}
