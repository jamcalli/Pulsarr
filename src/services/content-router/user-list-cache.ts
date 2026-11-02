import type { CacheRegistry } from '@services/cache-registry.service.js'
import type { LRUCache } from 'lru-cache'

export const LIST_CACHE_TTL_MS = 10_000

const USER_LIST_CACHE_MAX = 1000

/** Item keys per list, keyed by normalized list name. */
export type UserLists = Map<string, Set<string>>

export interface UserListEntry {
  lists: UserLists
  /** Every rule list name a load has covered, matched or not. */
  fetchedFor: Set<string>
}

export interface UserListRequest {
  names: ReadonlySet<string>
  load: () => Promise<UserLists | null>
}

/** Keyed by user id. */
export type UserListCache = LRUCache<number, UserListEntry, UserListRequest>

export function createUserListCache(registry: CacheRegistry): UserListCache {
  return registry.create({
    max: USER_LIST_CACHE_MAX,
    ttl: LIST_CACHE_TTL_MS,
    // A drop mid-load still answers its waiting callers but is not written back
    ignoreFetchAbort: true,
    // A failed load resolves undefined, which keeps the entry it was refreshing
    fetchMethod: async (_userId, current, { context: { names, load } }) => {
      const lists = await load()
      if (!lists) return undefined
      return {
        lists: new Map([...(current?.lists ?? []), ...lists]),
        fetchedFor: new Set([...(current?.fetchedFor ?? []), ...names]),
      }
    },
  })
}

function covers(entry: UserListEntry, names: ReadonlySet<string>): boolean {
  return [...names].every((name) => entry.fetchedFor.has(name))
}

/** The user's lists covering every name, loading the missing ones through one shared load per user. Undefined when a load finds nothing. */
export async function readUserLists(
  cache: UserListCache,
  userId: number,
  request: UserListRequest,
): Promise<UserLists | undefined> {
  let entry = cache.get(userId)
  while (!entry || !covers(entry, request.names)) {
    // Joins a load already in flight for the user, which may cover other names, so the loop checks again
    entry = await cache.fetch(userId, { forceRefresh: true, context: request })
    if (!entry) return undefined
  }
  return entry.lists
}
