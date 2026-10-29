import { ARR_RESOURCE_CACHE_TTL_MS } from '@services/arr/arr-instance-cache.js'

export interface ArrExclusions<TItem> {
  items: readonly TItem[]
  ids: ReadonlySet<number>
}

/** Caches the exclusion list for the TTL, sharing a pending fetch until it settles and starting the TTL only once it succeeds. */
export class ArrExclusionIds<TItem> {
  private exclusions: Promise<ArrExclusions<TItem>> | null = null
  private expiresAt = 0

  constructor(private readonly load: () => Promise<ArrExclusions<TItem>>) {}

  async has(id: number): Promise<boolean> {
    return (await this.read()).ids.has(id)
  }

  async items(): Promise<readonly TItem[]> {
    return (await this.read()).items
  }

  private read(): Promise<ArrExclusions<TItem>> {
    if (!this.exclusions || Date.now() >= this.expiresAt) {
      const pending = this.load()
      this.exclusions = pending
      this.expiresAt = Number.POSITIVE_INFINITY
      pending.then(
        () => {
          if (this.exclusions === pending) {
            this.expiresAt = Date.now() + ARR_RESOURCE_CACHE_TTL_MS
          }
        },
        () => {
          if (this.exclusions === pending) this.exclusions = null
        },
      )
    }
    return this.exclusions
  }
}
