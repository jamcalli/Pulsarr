import type { UserMapEntry } from '@root/types/plex.types.js'
import type { FastifyBaseLogger } from 'fastify'
import type { WorkflowDeps } from '../types.js'

export async function lookupUserByUuid(
  uuid: string,
  cache: Map<string, UserMapEntry>,
  deps: Pick<WorkflowDeps, 'logger' | 'plexService'>,
): Promise<{ userId: number | null; cache: Map<string, UserMapEntry> }> {
  const cachedEntry = cache.get(uuid)
  if (cachedEntry !== undefined) {
    return { userId: cachedEntry.userId, cache }
  }

  deps.logger.info({ uuid }, 'Unknown UUID in friends RSS, refreshing cache')
  const updatedCache = await refreshPlexUuidCache(cache, deps)

  const entryAfterRefresh = updatedCache.get(uuid)
  if (!entryAfterRefresh) {
    deps.logger.info(
      { uuid },
      'RSS author not found in friends list - skipping',
    )
  }

  return { userId: entryAfterRefresh?.userId ?? null, cache: updatedCache }
}

export async function refreshPlexUuidCache(
  currentCache: Map<string, UserMapEntry>,
  deps: Pick<WorkflowDeps, 'logger' | 'plexService'>,
): Promise<Map<string, UserMapEntry>> {
  try {
    const friendChanges = await deps.plexService.checkFriendChanges()
    const newCache = updatePlexUuidCache(friendChanges.userMap, deps.logger)
    deps.logger.debug({ cacheSize: newCache.size }, 'Plex UUID cache refreshed')
    return newCache
  } catch (error) {
    deps.logger.error({ error }, 'Failed to refresh Plex UUID cache')
    return currentCache
  }
}

export function updatePlexUuidCache(
  userMap: Map<string, UserMapEntry>,
  logger: FastifyBaseLogger,
): Map<string, UserMapEntry> {
  const newCache = new Map(userMap)
  logger.debug({ cacheSize: newCache.size }, 'Updated Plex UUID cache')
  return newCache
}
