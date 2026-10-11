import type { DatabaseService } from '@services/database.service.js'
import type { PlexServerService } from '@services/plex-server.service.js'
import { buildPlexGuid } from '@utils/guid-handler.js'
import type { FastifyBaseLogger } from 'fastify'

export interface StaleRatingKeyDeps {
  plexServer: PlexServerService
  db: DatabaseService
  logger: FastifyBaseLogger
}

export type StaleRatingKeyResolution =
  | { outcome: 'relocated'; ratingKey: string }
  | { outcome: 'deleted' }

/** Call only once Plex reported the key missing. Moves its tracking to the content's current key, or deletes it for every user. */
export async function resolveStaleRatingKey(
  deps: StaleRatingKeyDeps,
  ratingKey: string,
  contentGuids: string[],
): Promise<StaleRatingKeyResolution> {
  const currentKey = await findCurrentRatingKey(deps, ratingKey, contentGuids)

  if (currentKey) {
    const moved = await deps.db.updateTrackingRatingKey(ratingKey, currentKey)
    deps.logger.info(
      { ratingKey, currentKey, moved },
      `Rating key ${ratingKey} is gone from Plex, moved its tracking to ${currentKey}`,
    )
    return { outcome: 'relocated', ratingKey: currentKey }
  }

  const deleted = await deps.db.cleanupRatingKeyTracking(ratingKey)
  deps.logger.info(
    { ratingKey, deleted },
    `Rating key ${ratingKey} is gone from Plex and its content was not found, dropped its tracking`,
  )
  return { outcome: 'deleted' }
}

async function findCurrentRatingKey(
  deps: StaleRatingKeyDeps,
  staleKey: string,
  contentGuids: string[],
): Promise<string | null> {
  for (const guid of contentGuids) {
    // Tracking holds external ids, but Plex is only searchable by the plex:// guid the watchlist item carries
    const watchlistItems = await deps.db.getWatchlistItemsByGuid(guid)
    const plexGuids = new Set(
      watchlistItems
        .filter((item) => item.key)
        .map((item) =>
          buildPlexGuid(item.type === 'show' ? 'show' : 'movie', item.key),
        ),
    )

    for (const plexGuid of plexGuids) {
      const plexItems = await deps.plexServer.searchByGuid(plexGuid)
      const match = plexItems.find((item) => item.ratingKey !== staleKey)
      if (match) return match.ratingKey
    }
  }

  return null
}
