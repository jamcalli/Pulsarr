import type { ExistingContentMode } from '@root/schemas/common/existing-content-mode.schema.js'
import type { DatabaseWatchlistItem } from '@root/types/watchlist-status.types.js'
import type { FastifyBaseLogger } from 'fastify'

export interface DormantCopyChecker {
  getAllInstances(): Promise<
    Array<{ id: number; existingContentMode: ExistingContentMode }>
  >
  hasDormantCopy(instanceId: number, externalId: number): Promise<boolean>
}

interface MatchLocation {
  instanceId: number | undefined
  externalId: number
}

/** Drops each pending row's matches that are dormant copies on a reactivating instance, counting a failed lookup as dormant. */
export async function dropDormantMatches<TContent>(
  logger: FastifyBaseLogger,
  checker: DormantCopyChecker,
  locate: (match: TContent) => MatchLocation,
  matchesByWatchlistId: Map<number, TContent[]>,
  watchlistItems: DatabaseWatchlistItem[],
): Promise<Map<number, TContent[]>> {
  const reactivating = new Set(
    (await checker.getAllInstances())
      .filter((instance) => instance.existingContentMode === 'dormant')
      .map((instance) => instance.id),
  )
  if (reactivating.size === 0) return matchesByWatchlistId

  const isDormant = async (match: TContent): Promise<boolean> => {
    const { instanceId, externalId } = locate(match)
    if (instanceId === undefined || !reactivating.has(instanceId)) return false
    try {
      return await checker.hasDormantCopy(instanceId, externalId)
    } catch (error) {
      logger.debug(
        { error, instanceId, externalId },
        'Could not check for a dormant copy, leaving the pending row as is',
      )
      return true
    }
  }

  const filtered = new Map(matchesByWatchlistId)
  for (const item of watchlistItems) {
    if (item.id === undefined || item.status !== 'pending') continue
    const matches = filtered.get(item.id)
    if (!matches) continue
    const kept: TContent[] = []
    for (const match of matches) {
      if (!(await isDormant(match))) kept.push(match)
    }
    filtered.set(item.id, kept)
  }
  return filtered
}
