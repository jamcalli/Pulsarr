import type {
  ArrQualityProfile,
  ArrTag,
} from '@root/types/arr-connection.types.js'
import type { ArrClient } from '@services/arr/arr-client.js'
import type { CacheRegistry } from '@services/cache-registry.service.js'
import type { FastifyBaseLogger } from 'fastify'
import type { LRUCache } from 'lru-cache'

export const ARR_RESOURCE_CACHE_TTL_MS = 30_000

const ARR_CACHE_MAX_INSTANCES = 100

/** Reads the owning service's live state, so helpers built in its constructor see the client set by initialize. */
export interface ArrInstanceContext {
  readonly appName: string
  readonly log: FastifyBaseLogger
  client(): ArrClient
  instanceId(): number | undefined
}

export type ArrLoad<V> = () => Promise<V>

export interface ArrCache<V extends {}> {
  readonly label: string
  readonly entries: LRUCache<number, V, ArrLoad<V>>
}

export interface ArrExclusions<TItem> {
  items: readonly TItem[]
  ids: ReadonlySet<number>
}

export interface ArrResourceCaches {
  tags: ArrCache<ArrTag[]>
  qualityProfiles: ArrCache<ArrQualityProfile[]>
}

/** One set per product, keyed by instance id, shared by every service object built for that instance. */
export interface ArrCaches<TResource, TItem> extends ArrResourceCaches {
  exclusions: ArrCache<ArrExclusions<TItem>>
  /** Never stores a settled library, so it only shares a fetch already in flight. */
  library: ArrCache<TResource[]>
}

export interface ArrCacheReadOptions {
  /** Skips a cached value and never falls back to a stale one, while still joining a fetch in flight. */
  fresh?: boolean
}

function arrCache<V extends {}>(
  registry: CacheRegistry,
  label: string,
  options: Pick<
    LRUCache.Options<number, V, ArrLoad<V>>,
    'ttl' | 'maxEntrySize' | 'sizeCalculation'
  >,
): ArrCache<V> {
  return {
    label,
    entries: registry.create<number, V, ArrLoad<V>>({
      ...options,
      max: ARR_CACHE_MAX_INSTANCES,
      // An entry dropped mid-fetch still answers its waiting callers but is not written back
      ignoreFetchAbort: true,
      // Keeps the expired value after a failed refresh so readArrCache can serve it
      noDeleteOnFetchRejection: true,
      fetchMethod: (_instanceId, _stale, { context: load }) => load(),
    }),
  }
}

export function createArrCaches<TResource, TItem>(
  registry: CacheRegistry,
): ArrCaches<TResource, TItem> {
  const ttl = ARR_RESOURCE_CACHE_TTL_MS
  return {
    tags: arrCache(registry, 'tags', { ttl }),
    qualityProfiles: arrCache(registry, 'quality profiles', { ttl }),
    exclusions: arrCache(registry, 'exclusions', { ttl }),
    // A settled library outsizes maxEntrySize, so only the pending fetch is ever held
    library: arrCache(registry, 'library', {
      maxEntrySize: 1,
      sizeCalculation: () => 2,
    }),
  }
}

/** Shares a fetch in flight per instance and serves the last good value when a cached read's refresh fails. Loads directly when the instance has no id. */
export async function readArrCache<V extends {}>(
  cache: ArrCache<V>,
  instance: ArrInstanceContext,
  load: ArrLoad<V>,
  { fresh = false }: ArrCacheReadOptions = {},
): Promise<V> {
  const instanceId = instance.instanceId()
  if (instanceId === undefined) return load()
  try {
    return await cache.entries.forceFetch(instanceId, {
      context: load,
      forceRefresh: fresh,
    })
  } catch (error) {
    const stale = fresh
      ? undefined
      : cache.entries.peek(instanceId, { allowStale: true })
    if (stale === undefined) throw error
    instance.log.warn(
      { error, instanceId },
      `Using stale ${cache.label} cache for ${instance.appName} instance ${instanceId}`,
    )
    return stale
  }
}

export function dropArrCacheEntries<TResource, TItem>(
  caches: ArrCaches<TResource, TItem>,
  instanceId: number,
): void {
  caches.tags.entries.delete(instanceId)
  caches.qualityProfiles.entries.delete(instanceId)
  caches.exclusions.entries.delete(instanceId)
  caches.library.entries.delete(instanceId)
}
