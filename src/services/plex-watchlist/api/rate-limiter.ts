import type { FastifyBaseLogger } from 'fastify'

export class PlexRateLimiter {
  private static instance: PlexRateLimiter
  private isRateLimited = false
  private cooldownEndTime = 0
  private consecutiveRateLimits = 0
  private baseMultiplier = 2 // seconds
  private maxCooldown = 30 // seconds
  private lastErrorTime = 0
  private hasLoggedWait = false

  public static getInstance(): PlexRateLimiter {
    if (!PlexRateLimiter.instance) {
      PlexRateLimiter.instance = new PlexRateLimiter()
    }
    return PlexRateLimiter.instance
  }

  public isLimited(): boolean {
    const now = Date.now()
    if (this.isRateLimited && now > this.cooldownEndTime) {
      this.isRateLimited = false
      this.hasLoggedWait = false
    }
    return this.isRateLimited
  }

  public getRemainingCooldown(): number {
    if (!this.isRateLimited) return 0
    const remaining = this.cooldownEndTime - Date.now()
    return Math.max(remaining, 0)
  }

  public setRateLimited(
    retryAfterSeconds?: number,
    log?: FastifyBaseLogger,
  ): number {
    const now = Date.now()
    const wasAlreadyLimited = this.isRateLimited

    if (now - this.lastErrorTime < 10000) {
      this.consecutiveRateLimits++
    } else {
      this.consecutiveRateLimits = 1
    }
    this.lastErrorTime = now

    let cooldownSeconds = retryAfterSeconds || 0

    if (!cooldownSeconds) {
      cooldownSeconds = Math.min(
        this.baseMultiplier * 1.5 ** (this.consecutiveRateLimits - 1),
        this.maxCooldown,
      )
    }

    const jitter = cooldownSeconds * 0.1
    cooldownSeconds += Math.random() * jitter * 2 - jitter

    cooldownSeconds = Math.min(Math.max(cooldownSeconds, 0.1), this.maxCooldown)

    const newCooldownEnd = now + cooldownSeconds * 1000

    const shouldLog =
      !wasAlreadyLimited || newCooldownEnd > this.cooldownEndTime + 1000

    this.cooldownEndTime = Math.max(this.cooldownEndTime, newCooldownEnd)
    this.isRateLimited = true

    if (log && shouldLog) {
      log.warn(
        `Plex rate limit detected. Cooling down ALL processes for ${cooldownSeconds.toFixed(1)}s. Consecutive rate limits: ${this.consecutiveRateLimits}`,
      )
    }

    return cooldownSeconds * 1000
  }

  public async waitIfLimited(
    log?: FastifyBaseLogger,
    onWait?: (remainingMs: number) => void,
  ): Promise<boolean> {
    if (this.isLimited()) {
      const remaining = this.getRemainingCooldown()

      if (remaining <= 0) return false

      if (log && !this.hasLoggedWait) {
        log.info(
          `Waiting ${(remaining / 1000).toFixed(1)}s for Plex rate limit cooldown to expire`,
        )
        this.hasLoggedWait = true
      }

      onWait?.(remaining)

      await new Promise((resolve) => setTimeout(resolve, remaining))
      return true
    }
    return false
  }

  public reset(): void {
    this.isRateLimited = false
    this.cooldownEndTime = 0
    this.consecutiveRateLimits = 0
    this.lastErrorTime = 0
    this.hasLoggedWait = false
  }
}
