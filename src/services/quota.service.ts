import type { FastifyInstance } from 'fastify'
import type {
  UserQuotaConfig,
  QuotaStatus,
  QuotaType,
  CreateUserQuotaData,
  UpdateUserQuotaData,
} from '@root/types/approval.types.js'

export class QuotaService {
  constructor(private fastify: FastifyInstance) {}

  /**
   * Sets up default quota for a new user
   */
  async setupDefaultQuota(
    userId: number,
    quotaType: QuotaType = 'monthly',
    quotaLimit = 10,
  ): Promise<UserQuotaConfig> {
    const data: CreateUserQuotaData = {
      userId,
      quotaType,
      quotaLimit,
      bypassApproval: false,
    }

    // Note: reset days are no longer used - quotas reset based on maintenance schedule

    return this.fastify.db.createUserQuota(data)
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
    contentType?: 'movie' | 'show',
  ): Promise<QuotaStatus | null> {
    return this.fastify.db.getQuotaStatus(userId, contentType)
  }

  /**
   * Checks if a user would exceed quota with a new request
   */
  async wouldExceedQuota(
    userId: number,
    contentType?: 'movie' | 'show',
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

    const remaining = status.quotaLimit - status.currentUsage
    const percentage = (status.currentUsage / status.quotaLimit) * 100

    let displayText = `${status.currentUsage}/${status.quotaLimit} used`
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
        const result = await this.fastify.db.updateUserQuota(userId, updates)
        if (result) {
          results.updated++
        } else {
          results.failed.push(userId)
          results.errors.push(`User ${userId} quota not found`)
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
        // Get user's quota usage since fromDate or beginning
        const history = await this.fastify.db.getQuotaUsageHistory(
          userId,
          fromDate,
        )

        if (history.length === 0) {
          continue // No usage to reset
        }

        // For actual reset, we would need a delete method in the database
        // This is a placeholder implementation
        this.fastify.log.info(
          `Would reset ${history.length} quota usage records for user ${userId}`,
        )

        usersProcessed++
        totalRecordsDeleted += history.length
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
   * Performs maintenance tasks like cleanup and quota resets
   */
  async performMaintenance(): Promise<void> {
    try {
      await this.performAllQuotaMaintenance()
    } catch (error) {
      this.fastify.log.error('Failed to perform quota maintenance:', error)
    }
  }

  /**
   * Performs all quota maintenance including resets and cleanup
   *
   * This runs on the admin-configured schedule and handles:
   * - Daily quota resets (every time maintenance runs)
   * - Monthly quota resets (on the 1st of each month when maintenance runs)
   * - Cleanup of old usage records
   */
  async performAllQuotaMaintenance(): Promise<void> {
    const now = new Date()

    // Handle quota resets based on current date
    await this.handleQuotaResets(now)

    // Cleanup old quota usage records (older than 90 days)
    const cleanedCount = await this.fastify.db.cleanupOldQuotaUsage(90)
    if (cleanedCount > 0) {
      this.fastify.log.info(
        `Cleaned up ${cleanedCount} old quota usage records`,
      )
    }
  }

  /**
   * Handles quota resets based on current date and quota types
   *
   * Daily quotas: Reset tracking every time maintenance runs (admin controls frequency)
   * Monthly quotas: Reset only on 1st of month when maintenance runs
   */
  private async handleQuotaResets(now: Date): Promise<void> {
    try {
      let totalResets = 0

      // Handle daily quota resets - reset every time maintenance runs
      const dailyQuotas = await this.fastify.db.getUsersWithQuotaType('daily')
      for (const quota of dailyQuotas) {
        const today = now.toISOString().split('T')[0]
        const lastReset = await this.fastify.db.getLastQuotaReset(quota.userId)

        if (!lastReset || !lastReset.startsWith(today)) {
          await this.fastify.db.recordQuotaReset(quota.userId, today)
          totalResets++
          this.fastify.log.debug(`Reset daily quota for user ${quota.userId}`)
        }
      }

      // Handle weekly rolling quota resets - reset every 7 days
      const weeklyQuotas =
        await this.fastify.db.getUsersWithQuotaType('weekly_rolling')
      if (weeklyQuotas.length > 0) {
        // Check if it's been 7 days since the last weekly reset
        const lastWeeklyReset = await this.getLastWeeklyReset()
        const daysSinceReset = lastWeeklyReset
          ? Math.floor(
              (now.getTime() - lastWeeklyReset.getTime()) /
                (1000 * 60 * 60 * 24),
            )
          : 7 // Force reset if no previous reset

        if (daysSinceReset >= 7) {
          // Record reset for weekly rolling quotas using the standard method
          const resetPeriod = now.toISOString().split('T')[0]
          for (const quota of weeklyQuotas) {
            await this.fastify.db.recordQuotaReset(quota.userId, resetPeriod)
            totalResets++
            this.fastify.log.info(
              `Reset weekly rolling quota for user ${quota.userId}`,
            )
          }
        }
      }

      // Handle monthly quota resets - only on 1st of month
      if (now.getDate() === 1) {
        const monthlyQuotas =
          await this.fastify.db.getUsersWithQuotaType('monthly')
        for (const quota of monthlyQuotas) {
          const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
          const lastReset = await this.fastify.db.getLastQuotaReset(
            quota.userId,
          )

          if (!lastReset || !lastReset.startsWith(currentMonth)) {
            await this.fastify.db.recordQuotaReset(quota.userId, currentMonth)
            totalResets++
            this.fastify.log.info(
              `Reset monthly quota for user ${quota.userId}`,
            )
          }
        }
      }

      if (totalResets > 0) {
        this.fastify.log.info(
          `Completed quota maintenance: ${totalResets} quota resets processed`,
        )
      }
    } catch (error) {
      this.fastify.log.error('Failed to handle quota resets:', error)
    }
  }

  /**
   * Gets the most recent weekly rolling quota reset date
   */
  private async getLastWeeklyReset(): Promise<Date | null> {
    // Get any weekly rolling user and check their last reset
    const weeklyQuotas =
      await this.fastify.db.getUsersWithQuotaType('weekly_rolling')
    if (weeklyQuotas.length === 0) return null

    // Check the most recent reset date among all weekly rolling users
    let mostRecentReset: Date | null = null
    for (const quota of weeklyQuotas) {
      const lastReset = await this.fastify.db.getLastQuotaReset(quota.userId)
      if (lastReset) {
        const resetDate = new Date(lastReset)
        if (!mostRecentReset || resetDate > mostRecentReset) {
          mostRecentReset = resetDate
        }
      }
    }

    return mostRecentReset
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
    const usersWithQuotas = await this.fastify.db.getUsersWithQuotas()

    // This would need additional database methods for full analytics
    // For now, return basic stats
    const totalQuotaLimit = usersWithQuotas.reduce(
      (sum, quota) => sum + quota.quotaLimit,
      0,
    )
    const averageQuotaLimit =
      usersWithQuotas.length > 0 ? totalQuotaLimit / usersWithQuotas.length : 0

    return {
      totalUsers: 0, // Would need to get total user count
      usersWithQuotas: usersWithQuotas.length,
      averageQuotaLimit: Math.round(averageQuotaLimit * 100) / 100,
      topQuotaUsers: [], // Would need additional queries
    }
  }
}
