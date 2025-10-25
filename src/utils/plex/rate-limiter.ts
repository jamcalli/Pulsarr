import type { ProgressService } from '@root/types/progress.types.js'
import type { FastifyBaseLogger } from 'fastify'

/**
 * Global rate limiting control for Plex API requests.
 *
 * Using a singleton pattern to track and control rate limiting across all processes.
 * Implements exponential backoff with jitter to avoid thundering herd problems.
 */
export class PlexRateLimiter {
  private static instance: PlexRateLimiter
  private isRateLimited = false
  private cooldownEndTime = 0
  private consecutiveRateLimits = 0
  private baseMultiplier = 2 // seconds
  private maxCooldown = 30 // seconds
  private lastErrorTime = 0
  private hasLoggedWait = false // Track if we've logged for current cooldown

  // Singleton access
  public static getInstance(): PlexRateLimiter {
    if (!PlexRateLimiter.instance) {
      PlexRateLimiter.instance = new PlexRateLimiter()
    }
    return PlexRateLimiter.instance
  }

  // Check if we're currently in a rate-limited state
  public isLimited(): boolean {
    const now = Date.now()
    // Clear rate limited state if cooldown period has passed
    if (this.isRateLimited && now > this.cooldownEndTime) {
      this.isRateLimited = false
      this.hasLoggedWait = false // Reset log flag when cooldown expires
    }
    return this.isRateLimited
  }

  // Get remaining cooldown time in ms
  public getRemainingCooldown(): number {
    if (!this.isRateLimited) return 0
    const remaining = this.cooldownEndTime - Date.now()
    return remaining > 0 ? remaining : 0
  }

  // Set rate limited state with a specific duration, or use default exponential backoff
  public setRateLimited(
    retryAfterSeconds?: number,
    log?: FastifyBaseLogger,
  ): number {
    // Track consecutive rate limits if they happen close together (within 10 seconds)
    const now = Date.now()
    const wasAlreadyLimited = this.isRateLimited

    if (now - this.lastErrorTime < 10000) {
      this.consecutiveRateLimits++
    } else {
      this.consecutiveRateLimits = 1
    }
    this.lastErrorTime = now

    // Calculate cooldown time
    let cooldownSeconds = retryAfterSeconds || 0

    if (!cooldownSeconds) {
      // Apply exponential backoff with consecutive failure tracking
      cooldownSeconds = Math.min(
        this.baseMultiplier * 1.5 ** (this.consecutiveRateLimits - 1),
        this.maxCooldown,
      )
    }

    // Apply jitter (±10%) to avoid thundering herd
    const jitter = cooldownSeconds * 0.1
    cooldownSeconds += Math.random() * jitter * 2 - jitter

    // Clamp to [0.1s, maxCooldown] after jitter
    cooldownSeconds = Math.min(Math.max(cooldownSeconds, 0.1), this.maxCooldown)

    // Calculate end time of cooldown
    const newCooldownEnd = now + cooldownSeconds * 1000

    // Only log if this is a NEW rate limit or significantly extends the cooldown
    const shouldLog =
      !wasAlreadyLimited || newCooldownEnd > this.cooldownEndTime + 1000

    this.cooldownEndTime = Math.max(this.cooldownEndTime, newCooldownEnd)
    this.isRateLimited = true

    if (log && shouldLog) {
      log.warn(
        `Plex rate limit detected. Cooling down ALL processes for ${cooldownSeconds.toFixed(1)}s. Consecutive rate limits: ${this.consecutiveRateLimits}`,
      )
    }

    return cooldownSeconds * 1000 // Return cooldown in ms
  }

  // Wait for cooldown if currently rate limited
  public async waitIfLimited(
    log?: FastifyBaseLogger,
    progress?: {
      progress: ProgressService
      operationId: string
      type: 'self-watchlist' | 'others-watchlist' | 'rss-feed' | 'system'
      message?: string
      currentProgress?: number
    },
  ): Promise<boolean> {
    if (this.isLimited()) {
      const remaining = this.getRemainingCooldown()

      if (remaining <= 0) return false

      // Only log once per cooldown period (first caller logs)
      if (log && !this.hasLoggedWait) {
        log.info(
          `Waiting ${(remaining / 1000).toFixed(1)}s for Plex rate limit cooldown to expire`,
        )
        this.hasLoggedWait = true
      }

      if (progress) {
        // Use current progress if provided, otherwise calculate based on remaining time
        const progressValue =
          progress.currentProgress !== undefined ? progress.currentProgress : 50 // Fallback to 50% if no current progress provided

        progress.progress.emit({
          operationId: progress.operationId,
          type: progress.type,
          phase: 'processing',
          progress: progressValue,
          message:
            progress.message ||
            `Rate limited by Plex API. Waiting ${Math.round(remaining / 1000)}s for cooldown...`,
        })
      }

      await new Promise((resolve) => setTimeout(resolve, remaining))
      return true
    }
    return false
  }

  // Reset rate limited state (useful for testing)
  public reset(): void {
    this.isRateLimited = false
    this.cooldownEndTime = 0
    this.consecutiveRateLimits = 0
    this.lastErrorTime = 0
    this.hasLoggedWait = false
  }
}
