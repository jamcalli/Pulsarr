/** Remembers the last notice per key so a check that repeats on one episode logs it above debug only once. */
export class EpisodeNotices {
  private readonly lastByKey = new Map<string, string>()

  /** True unless message is the one last noted for key. */
  isNew(key: string, message: string): boolean {
    if (this.lastByKey.get(key) === message) return false
    this.lastByKey.set(key, message)
    return true
  }
}
