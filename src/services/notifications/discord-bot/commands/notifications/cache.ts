/**
 * Notifications Command Settings Cache
 *
 * Singleton cache for tracking active notification settings sessions.
 * Keeps as class because it's stateful with cleanup interval.
 */

/**
 * Cache for tracking active notification settings sessions.
 *
 * Sessions expire after 15 minutes of inactivity.
 */
export class SettingsCache {
  private static instance: SettingsCache
  private cache: Map<string, { messageId: string; timestamp: number }> =
    new Map()
  private readonly SESSION_TIMEOUT = 15 * 60 * 1000 // 15 minutes

  private constructor() {
    const cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000)
    cleanupInterval.unref() // Don't keep process alive for cleanup
  }

  static getInstance(): SettingsCache {
    if (!SettingsCache.instance) {
      SettingsCache.instance = new SettingsCache()
    }
    return SettingsCache.instance
  }

  has(userId: string): boolean {
    const entry = this.cache.get(userId)
    if (!entry) return false

    if (Date.now() - entry.timestamp > this.SESSION_TIMEOUT) {
      this.delete(userId)
      return false
    }
    return true
  }

  set(userId: string, messageId: string): void {
    this.cache.set(userId, {
      messageId,
      timestamp: Date.now(),
    })
  }

  delete(userId: string): void {
    this.cache.delete(userId)
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [userId, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.SESSION_TIMEOUT) {
        this.cache.delete(userId)
      }
    }
  }
}
