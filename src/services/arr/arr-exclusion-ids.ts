import { ARR_RESOURCE_CACHE_TTL_MS } from '@services/arr/arr-instance-cache.js'

/** Caches the excluded ids for the TTL, sharing a pending fetch until it settles and starting the TTL only once it succeeds. */
export class ArrExclusionIds {
  private ids: Promise<Set<number>> | null = null
  private expiresAt = 0

  constructor(private readonly load: () => Promise<Set<number>>) {}

  async has(id: number): Promise<boolean> {
    if (!this.ids || Date.now() >= this.expiresAt) {
      const pending = this.load()
      this.ids = pending
      this.expiresAt = Number.POSITIVE_INFINITY
      pending.then(
        () => {
          if (this.ids === pending) {
            this.expiresAt = Date.now() + ARR_RESOURCE_CACHE_TTL_MS
          }
        },
        () => {
          if (this.ids === pending) this.ids = null
        },
      )
    }
    return (await this.ids).has(id)
  }
}
