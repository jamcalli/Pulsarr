import type {
  UserQuotaConfig,
  QuotaUsage,
  QuotaStatus,
  QuotaType,
  QuotaExceeded,
  CreateUserQuotaData,
  UpdateUserQuotaData,
} from '@root/types/approval.types.js'

declare module '@services/database.service.js' {
  interface DatabaseService {
    // USER QUOTA MANAGEMENT
    /**
     * Creates a new user quota configuration
     * @param data - User quota configuration data
     * @returns Promise resolving to the created quota config
     */
    createUserQuota(data: CreateUserQuotaData): Promise<UserQuotaConfig>

    /**
     * Gets a user's quota configuration
     * @param userId - User ID
     * @returns Promise resolving to the quota config if found, null otherwise
     */
    getUserQuota(userId: number): Promise<UserQuotaConfig | null>

    /**
     * Updates a user's quota configuration
     * @param userId - User ID
     * @param data - Update data
     * @returns Promise resolving to the updated quota config if found, null otherwise
     */
    updateUserQuota(
      userId: number,
      data: UpdateUserQuotaData,
    ): Promise<UserQuotaConfig | null>

    /**
     * Deletes a user's quota configuration
     * @param userId - User ID
     * @returns Promise resolving to true if deleted, false if not found
     */
    deleteUserQuota(userId: number): Promise<boolean>

    /**
     * Records quota usage for a user
     * @param userId - User ID
     * @param contentType - Type of content (movie or show)
     * @param requestDate - Date of the request (default: current date)
     * @returns Promise resolving to the recorded quota usage
     */
    recordQuotaUsage(
      userId: number,
      contentType: 'movie' | 'show',
      requestDate?: Date,
    ): Promise<QuotaUsage>

    /**
     * Gets current quota usage for a user within the quota period
     * @param userId - User ID
     * @param quotaType - Type of quota to calculate usage for
     * @param contentType - Optional content type filter
     * @returns Promise resolving to the current usage count
     */
    getCurrentQuotaUsage(
      userId: number,
      quotaType: QuotaType,
      contentType?: 'movie' | 'show',
    ): Promise<number>

    /**
     * Gets quota status for a user including current usage and limits
     * @param userId - User ID
     * @param contentType - Optional content type filter
     * @returns Promise resolving to quota status if user has quotas, null otherwise
     */
    getQuotaStatus(
      userId: number,
      contentType?: 'movie' | 'show',
    ): Promise<QuotaStatus | null>

    /**
     * Gets quota status for multiple users in a single optimized query
     * @param userIds - Array of user IDs
     * @param contentType - Optional content type filter
     * @returns Promise resolving to array of user quota statuses
     */
    getBulkQuotaStatus(
      userIds: number[],
      contentType?: 'movie' | 'show',
    ): Promise<Array<{ userId: number; quotaStatus: QuotaStatus | null }>>

    /**
     * Checks if a user's quota is exceeded
     * @param userId - User ID
     * @param contentType - Optional content type filter
     * @returns Promise resolving to quota exceeded info if exceeded, null otherwise
     */
    checkQuotaExceeded(
      userId: number,
      contentType?: 'movie' | 'show',
    ): Promise<QuotaExceeded | null>

    /**
     * Gets all users with quota configurations
     * @returns Promise resolving to array of user quota configs
     */
    getUsersWithQuotas(): Promise<UserQuotaConfig[]>

    /**
     * Gets quota usage history for a user
     * @param userId - User ID
     * @param startDate - Optional start date filter
     * @param endDate - Optional end date filter
     * @param contentType - Optional content type filter
     * @returns Promise resolving to array of quota usage records
     */
    getQuotaUsageHistory(
      userId: number,
      startDate?: Date,
      endDate?: Date,
      contentType?: 'movie' | 'show',
    ): Promise<QuotaUsage[]>

    /**
     * Gets daily usage statistics for a user
     * @param userId - User ID
     * @param days - Number of days to include (default: 30)
     * @returns Promise resolving to array of daily usage stats
     */
    getDailyUsageStats(
      userId: number,
      days?: number,
    ): Promise<{ date: string; movies: number; shows: number; total: number }[]>

    /**
     * Cleans up old quota usage records
     * @param olderThanDays - Delete usage records older than this many days (default: 90)
     * @returns Promise resolving to the number of deleted records
     */
    cleanupOldQuotaUsage(olderThanDays?: number): Promise<number>

    /**
     * Gets users with a specific quota type
     * @param quotaType - The quota type to filter by
     * @returns Promise resolving to array of user quota configs with the specified type
     */
    getUsersWithQuotaType(quotaType: QuotaType): Promise<UserQuotaConfig[]>

    /**
     * Gets the latest quota usage for a user
     * @param userId - User ID
     * @returns Promise resolving to the most recent quota usage if found, null otherwise
     */
    getLatestQuotaUsage(userId: number): Promise<QuotaUsage | null>

    /**
     * Gets the last quota reset date for a user
     * @param userId - User ID
     * @returns Promise resolving to the last reset date string if found, null otherwise
     */
    getLastQuotaReset(userId: number): Promise<string | null>

    /**
     * Records a quota reset for a user
     * @param userId - User ID
     * @param resetPeriod - The reset period identifier (e.g., "2025-01")
     * @returns Promise that resolves when the reset is recorded
     */
    recordQuotaReset(userId: number, resetPeriod: string): Promise<void>

    /**
     * Gets the next scheduled maintenance run time from the quota-maintenance schedule
     * @returns Promise resolving to the next maintenance run date if available, undefined otherwise
     */
    getNextMaintenanceRun(): Promise<Date | undefined>

    /**
     * Gets the start date for weekly rolling quotas based on the most recent reset
     * @returns Promise resolving to the start date for weekly rolling quotas
     */
    getWeeklyRollingStartDate(): Promise<Date>
  }
}
