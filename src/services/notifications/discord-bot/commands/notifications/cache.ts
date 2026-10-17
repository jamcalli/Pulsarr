export class SettingsCache {
  private static instance: SettingsCache
  private cache: Map<string, number> = new Map()
  private readonly SESSION_TIMEOUT = 15 * 60 * 1000

  private constructor() {
    const cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000)
    cleanupInterval.unref()
  }

  static getInstance(): SettingsCache {
    if (!SettingsCache.instance) {
      SettingsCache.instance = new SettingsCache()
    }
    return SettingsCache.instance
  }

  has(userId: string): boolean {
    const timestamp = this.cache.get(userId)
    if (timestamp === undefined) return false

    if (Date.now() - timestamp > this.SESSION_TIMEOUT) {
      this.delete(userId)
      return false
    }
    return true
  }

  set(userId: string): void {
    this.cache.set(userId, Date.now())
  }

  delete(userId: string): void {
    this.cache.delete(userId)
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [userId, timestamp] of this.cache.entries()) {
      if (now - timestamp > this.SESSION_TIMEOUT) {
        this.cache.delete(userId)
      }
    }
  }
}
