import { parseGuids } from '@utils/guid-handler.js'
import type { WatchlistGuidItem } from '../types.js'

export type GuidIndex = Map<string, Set<number>>

/** Maps each normalized guid to the ids of the users whose watchlist items carry it. */
export function buildGuidIndex(items: WatchlistGuidItem[]): GuidIndex {
  const index: GuidIndex = new Map()
  for (const item of items) {
    for (const guid of parseGuids(item.guids)) {
      const users = index.get(guid)
      if (users) {
        users.add(item.user_id)
      } else {
        index.set(guid, new Set([item.user_id]))
      }
    }
  }
  return index
}

export function usersForGuids(
  index: GuidIndex,
  guids: string[] | string | undefined,
): Set<number> {
  const users = new Set<number>()
  for (const guid of parseGuids(guids)) {
    for (const userId of index.get(guid) ?? []) {
      users.add(userId)
    }
  }
  return users
}
