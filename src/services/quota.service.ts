import { QUOTA_DEFAULTS } from '@root/schemas/shared/quota-limits.js'
import type {
  CreateUserQuotaData,
  EnabledQuotaData,
  QuotaStatus,
  QuotaType,
  UpdateUserQuotaData,
  UserQuotaConfig,
  UserQuotaConfigs,
} from '@root/types/approval.types.js'
import { isUniqueViolation } from '@utils/db-errors.js'
import { createServiceLogger } from '@utils/logger.js'
import { resolveQuotaWindowSettings } from '@utils/quota-window.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

export class QuotaService {
  private readonly log: FastifyBaseLogger

  constructor(
    readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'QUOTA')
  }

  /**
   * Log scheduled job execution with proper service prefix
   */
  logScheduledJob(action: 'start' | 'complete', jobName: string): void {
    this.log.debug(
      { jobName, action },
      action === 'start' ? 'Running scheduled job' : 'Completed scheduled job',
    )
  }

  /**
   * Creates quotas for a user with specified settings (manual creation)
   *
   * @throws 400 if the user does not exist, 409 if quotas already exist
   */
  async createUserQuotas(
    userId: number,
    quotaType: QuotaType,
    quotaLimit: number,
    bypassApproval = false,
    watchlistCap?: number | null,
  ): Promise<UserQuotaConfigs> {
    const user = await this.fastify.db.getUser(userId)
    if (!user) {
      throw this.fastify.httpErrors.badRequest('User not found')
    }

    const movieData: CreateUserQuotaData = {
      userId,
      contentType: 'movie',
      quotaType,
      quotaLimit,
      bypassApproval,
      watchlistCap: watchlistCap ?? null,
    }

    const showData: CreateUserQuotaData = {
      userId,
      contentType: 'show',
      quotaType,
      quotaLimit,
      bypassApproval,
      watchlistCap: watchlistCap ?? null,
    }

    try {
      const [movieQuota, showQuota] = await this.fastify.db.createUserQuotas([
        movieData,
        showData,
      ])
      this.clearWatchlistCapNotices([userId])
      return {
        userId,
        movieQuota: movieQuota || undefined,
        showQuota: showQuota || undefined,
      }
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw this.fastify.httpErrors.conflict(
          'User already has quota configurations',
        )
      }
      throw error
    }
  }

  /** Returns null when the user has no quotas to update. */
  async updateUserQuotas(
    userId: number,
    data: Omit<UpdateUserQuotaData, 'contentType'>,
  ): Promise<UserQuotaConfigs | null> {
    const existing = await this.fastify.db.getUserQuotas(userId)
    if (!existing.movieQuota && !existing.showQuota) {
      return null
    }

    const { movie: movieQuota, show: showQuota } =
      await this.fastify.db.updateUserQuotas(
        userId,
        [existing.movieQuota, existing.showQuota].flatMap((quota) =>
          quota ? [quota.contentType] : [],
        ),
        data,
      )

    if (!movieQuota && !showQuota) {
      throw new Error('Failed to update user quotas')
    }
    this.clearWatchlistCapNotices([userId])

    return {
      userId,
      ...(movieQuota && { movieQuota }),
      ...(showQuota && { showQuota }),
    }
  }

  /** Writes only the content types present in quotas, and a disabled type deletes that quota. */
  async updateUserQuotasByType(
    userId: number,
    quotas: { movieQuota?: EnabledQuotaData; showQuota?: EnabledQuotaData },
    autoApproveHeld: boolean,
    adminId?: number,
  ): Promise<UserQuotaConfigs> {
    const existing = await this.fastify.db.getUserQuotas(userId)

    const movieQuota = await this.writeQuotaByType(
      userId,
      'movie',
      quotas.movieQuota,
      existing.movieQuota,
    )
    const showQuota = await this.writeQuotaByType(
      userId,
      'show',
      quotas.showQuota,
      existing.showQuota,
    )

    this.clearWatchlistCapNotices([userId], {
      movie: Boolean(quotas.movieQuota),
      show: Boolean(quotas.showQuota),
    })

    if (autoApproveHeld) {
      await this.fastify.approvalService.reEvaluateQuotaExceededApprovals(
        userId,
        adminId,
      )
    }

    return { userId, movieQuota, showQuota }
  }

  private async writeQuotaByType(
    userId: number,
    contentType: 'movie' | 'show',
    quota: EnabledQuotaData | undefined,
    existing: UserQuotaConfig | undefined,
  ): Promise<UserQuotaConfig | undefined> {
    if (!quota) {
      return existing
    }
    if (!quota.enabled) {
      if (existing) {
        await this.fastify.db.deleteUserQuota(userId, contentType)
      }
      return undefined
    }

    const bypassApproval = quota.bypassApproval ?? false
    if (existing) {
      const updated = await this.fastify.db.updateUserQuota(
        userId,
        contentType,
        {
          quotaType: quota.quotaType,
          quotaLimit: quota.quotaLimit,
          bypassApproval,
          watchlistCap: quota.watchlistCap,
        },
      )
      return updated || undefined
    }

    if (!quota.quotaType || !quota.quotaLimit) {
      const label = contentType === 'movie' ? 'Movie' : 'Show'
      throw this.fastify.httpErrors.badRequest(
        `${label} quota type and limit are required`,
      )
    }
    return this.fastify.db.createUserQuota({
      userId,
      contentType,
      quotaType: quota.quotaType,
      quotaLimit: quota.quotaLimit,
      bypassApproval,
      watchlistCap: quota.watchlistCap,
    })
  }

  /** Returns null when the user had no quotas, and approvedHeld only when autoApproveHeld ran. */
  async deleteUserQuotas(
    userId: number,
    autoApproveHeld: boolean,
    adminId?: number,
  ): Promise<{ approvedHeld?: number } | null> {
    const deleted = await this.fastify.db.deleteAllUserQuotas(userId)
    if (!deleted) {
      return null
    }
    this.clearWatchlistCapNotices([userId])

    if (!autoApproveHeld) {
      return {}
    }
    const result =
      await this.fastify.approvalService.reEvaluateQuotaExceededApprovals(
        userId,
        adminId,
      )
    return { approvedHeld: result.approved }
  }

  async bulkUpdateQuotas(
    userIds: number[],
    operation: 'update' | 'delete',
    quotas: { movieQuota?: EnabledQuotaData; showQuota?: EnabledQuotaData },
  ): Promise<{ processedCount: number; failedIds: number[] }> {
    if (operation === 'delete') {
      const result = await this.fastify.db.bulkDeleteQuotas(userIds)
      this.clearWatchlistCapNotices(userIds)
      return result
    }

    const result = await this.fastify.db.bulkUpdateQuotas(
      userIds,
      quotas.movieQuota,
      quotas.showQuota,
    )
    this.clearWatchlistCapNotices(userIds, {
      movie: Boolean(quotas.movieQuota),
      show: Boolean(quotas.showQuota),
    })
    return result
  }

  /** Call after writing or deleting quota rows so a stale notified count cannot suppress the next cap notice. */
  private clearWatchlistCapNotices(
    userIds: number[],
    written: { movie: boolean; show: boolean } = { movie: true, show: true },
  ): void {
    for (const userId of userIds) {
      if (written.movie) {
        this.fastify.notifications.clearWatchlistCap(userId, 'movie')
      }
      if (written.show) {
        this.fastify.notifications.clearWatchlistCap(userId, 'show')
      }
    }
  }

  /**
   * Sets up default quotas for a new user based on config settings
   *
   * Idempotent: a user who already has quotas keeps them unchanged.
   */
  async setupDefaultQuotas(userId: number): Promise<UserQuotaConfigs> {
    const existing = await this.fastify.db.getUserQuotas(userId)
    if (existing.movieQuota || existing.showQuota) {
      return existing
    }

    const config = this.fastify.config
    const defaults: CreateUserQuotaData[] = []

    if (config.newUserDefaultMovieQuotaEnabled) {
      defaults.push({
        userId,
        contentType: 'movie',
        quotaType:
          config.newUserDefaultMovieQuotaType ?? QUOTA_DEFAULTS.quotaType,
        quotaLimit:
          config.newUserDefaultMovieQuotaLimit ?? QUOTA_DEFAULTS.limit,
        bypassApproval: config.newUserDefaultMovieBypassApproval ?? false,
        watchlistCap: config.newUserDefaultMovieWatchlistCap ?? null,
      })
    }

    if (config.newUserDefaultShowQuotaEnabled) {
      defaults.push({
        userId,
        contentType: 'show',
        quotaType:
          config.newUserDefaultShowQuotaType ?? QUOTA_DEFAULTS.quotaType,
        quotaLimit: config.newUserDefaultShowQuotaLimit ?? QUOTA_DEFAULTS.limit,
        bypassApproval: config.newUserDefaultShowBypassApproval ?? false,
        watchlistCap: config.newUserDefaultShowWatchlistCap ?? null,
      })
    }

    if (defaults.length === 0) {
      return { userId, movieQuota: undefined, showQuota: undefined }
    }

    try {
      const created = await this.fastify.db.createUserQuotas(defaults)
      return {
        userId,
        movieQuota: created.find((q) => q.contentType === 'movie'),
        showQuota: created.find((q) => q.contentType === 'show'),
      }
    } catch (error) {
      // a concurrent caller created them first
      if (isUniqueViolation(error)) {
        return this.fastify.db.getUserQuotas(userId)
      }
      throw error
    }
  }

  /**
   * Gets the current quota status for a user
   */
  async getUserQuotaStatus(
    userId: number,
    contentType: 'movie' | 'show',
  ): Promise<QuotaStatus | null> {
    return this.fastify.db.getQuotaStatus(
      userId,
      contentType,
      resolveQuotaWindowSettings(this.fastify.config.quotaSettings),
    )
  }

  async getBulkQuotaStatus(
    userIds: number[],
    contentType?: 'movie' | 'show',
  ): Promise<Array<{ userId: number; quotaStatus: QuotaStatus | null }>> {
    return this.fastify.db.getBulkQuotaStatus(
      userIds,
      resolveQuotaWindowSettings(this.fastify.config.quotaSettings),
      contentType,
    )
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
    if (config?.cleanup.enabled !== false) {
      const retentionDays = config?.cleanup.retentionDays ?? 90
      const cleanedCount =
        await this.fastify.db.cleanupOldQuotaUsage(retentionDays)
      if (cleanedCount > 0) {
        this.log.info(
          { cleanedCount, retentionDays },
          'Cleaned up old quota usage records',
        )
      }
    } else {
      const retentionDays = config?.cleanup.retentionDays ?? 90
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

  /**
   * Atomically attempts to consume one quota unit for a user.
   *
   * This method should be called BEFORE routing to prevent race conditions
   * where multiple concurrent requests all pass the quota check.
   *
   * Unlike recordUsage(), this method:
   * - Checks AND records in a single atomic transaction
   * - Returns immediately if quota would be exceeded
   * - Uses database-level locking for PostgreSQL
   *
   * @param userId - User ID
   * @param contentType - Content type (movie or show)
   * @returns Object with consumed flag, current usage, quota limit, and bypass status
   */
  async tryConsumeQuota(
    userId: number,
    contentType: 'movie' | 'show',
  ): Promise<{
    consumed: boolean
    currentUsage: number
    quotaLimit: number
    quotaType: QuotaType | 'none' | 'error'
    hasQuota: boolean
    userBypassEnabled: boolean
    exceededBy?: 'period'
  }> {
    try {
      // Get user's quota configuration
      const userQuota = await this.fastify.db.getUserQuota(userId, contentType)

      if (!userQuota) {
        // No quota configured - always allow
        return {
          consumed: false, // Nothing to consume
          currentUsage: 0,
          quotaLimit: 0,
          quotaType: 'none',
          hasQuota: false,
          userBypassEnabled: false,
        }
      }

      // If user has bypass enabled, skip period quota entirely
      if (userQuota.bypassApproval) {
        return {
          consumed: false, // Bypassed, no need to track period quota
          currentUsage: 0,
          quotaLimit: userQuota.quotaLimit,
          quotaType: userQuota.quotaType,
          hasQuota: true,
          userBypassEnabled: true,
        }
      }

      // Attempt atomic period quota consumption
      const result = await this.fastify.db.tryConsumeQuota(
        userId,
        contentType,
        userQuota.quotaType,
        userQuota.quotaLimit,
        resolveQuotaWindowSettings(this.fastify.config.quotaSettings),
      )

      if (!result.consumed) {
        return {
          consumed: false,
          currentUsage: result.currentUsage,
          quotaLimit: userQuota.quotaLimit,
          quotaType: userQuota.quotaType,
          hasQuota: true,
          userBypassEnabled: false,
          exceededBy: 'period',
        }
      }

      return {
        consumed: result.consumed,
        currentUsage: result.currentUsage,
        quotaLimit: userQuota.quotaLimit,
        quotaType: userQuota.quotaType,
        hasQuota: true,
        userBypassEnabled: false,
      }
    } catch (error) {
      this.log.error(
        { error, userId, contentType },
        'Error in tryConsumeQuota - falling back to allow',
      )
      // On error, allow routing to proceed (fail-open for availability)
      return {
        consumed: false,
        currentUsage: 0,
        quotaLimit: 0,
        quotaType: 'error',
        hasQuota: false,
        userBypassEnabled: false,
      }
    }
  }
}
