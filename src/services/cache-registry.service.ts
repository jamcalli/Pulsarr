import { LRUCache } from 'lru-cache'

export interface CacheClock {
  now(): number
}

/** Tracks every cache it creates, so one clear() empties them all. */
export class CacheRegistry {
  private readonly caches = new Set<{ clear(): void }>()

  /** A clock drives every TTL from it, so it must start above zero, which lru-cache reads as no start time. */
  constructor(private readonly clock?: CacheClock) {}

  create<K extends {}, V extends {}, FC = undefined>(
    options: LRUCache.Options<K, V, FC>,
  ): LRUCache<K, V, FC> {
    const cache = new LRUCache<K, V, FC>({
      ...options,
      // lru-cache otherwise reuses one reading of the clock for 1ms
      ...(this.clock && { perf: this.clock, ttlResolution: 0 }),
    })
    this.caches.add(cache)
    return cache
  }

  clear(): void {
    for (const cache of this.caches) cache.clear()
  }
}
