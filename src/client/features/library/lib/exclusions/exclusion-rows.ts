import type { components } from '@/types/api.js'

type ExclusionItem = components['schemas']['WatchlistExclusionItem']
type ExclusionScope = components['schemas']['WatchlistExclusionScope']
type CreatePayload = components['schemas']['WatchlistExclusionCreatePayload']

/** The newest of the global and every own exclusion, or null when the row has none. */
export function lastExcludedAt(item: ExclusionItem): string | null {
  const times = [
    item.globalExclusion?.excludedAt,
    ...item.users.map((user) => user.ownExclusion?.excludedAt),
  ].filter((time) => time !== undefined)
  let latest: string | null = null
  for (const time of times) {
    if (latest === null || Date.parse(time) > Date.parse(latest)) latest = time
  }
  return latest
}

export function exclusionIds(item: ExclusionItem): number[] {
  const own = item.users.flatMap((user) =>
    user.ownExclusion ? [user.ownExclusion.id] : [],
  )
  return item.globalExclusion ? [item.globalExclusion.id, ...own] : own
}

export function ownExclusionCount(item: ExclusionItem): number {
  return item.users.filter((user) => user.ownExclusion !== null).length
}

export function excludePayload(
  item: ExclusionItem,
  userIds: number[],
): CreatePayload {
  return {
    key: item.key,
    title: item.title,
    type: item.type,
    guids: item.guids,
    userIds,
  }
}

/** Users scope takes each row's watchlisters without an own exclusion, global scope takes rows without a global one. */
export function bulkExcludePlan(
  items: readonly ExclusionItem[],
  scope: ExclusionScope,
): { payloads: CreatePayload[]; skipped: number } {
  const payloads = items.flatMap((item) => {
    if (scope === 'global') {
      if (item.globalExclusion) return []
      return [
        excludePayload(
          item,
          item.users.map((user) => user.userId),
        ),
      ]
    }
    const userIds = item.users
      .filter((user) => user.status !== null && user.ownExclusion === null)
      .map((user) => user.userId)
    return userIds.length > 0 ? [excludePayload(item, userIds)] : []
  })
  return { payloads, skipped: items.length - payloads.length }
}

/** Every exclusion id on the rows, global and own, and how many rows hold any. */
export function bulkRemovePlan(items: readonly ExclusionItem[]): {
  ids: number[]
  rows: number
} {
  const perRow = items.map(exclusionIds)
  return {
    ids: perRow.flat(),
    rows: perRow.filter((ids) => ids.length > 0).length,
  }
}

/** The keys of the rows holding any of `ids`, for keeping failed removes selected. */
export function keysHoldingIds(
  items: readonly ExclusionItem[],
  ids: readonly number[],
): string[] {
  const wanted = new Set(ids)
  return items
    .filter((item) => exclusionIds(item).some((id) => wanted.has(id)))
    .map((item) => item.key)
}
