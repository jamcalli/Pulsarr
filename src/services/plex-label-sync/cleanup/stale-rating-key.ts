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
  | { outcome: 'unresolved' }

/** Call only once Plex reported the key missing. Moves its tracking to the content's current key, deletes it for every user when Plex has no copy, or leaves it when the search itself failed. */
export async function resolveStaleRatingKey(
  deps: StaleRatingKeyDeps,
  ratingKey: string,
  contentGuids: string[],
): Promise<StaleRatingKeyResolution> {
  const current = await findCurrentRatingKey(deps, ratingKey, contentGuids)

  if (current.status === 'error') {
    deps.logger.warn(
      { ratingKey },
      `Rating key ${ratingKey} is gone from Plex but the search for its content failed, keeping its tracking`,
    )
    return { outcome: 'unresolved' }
  }

  if (current.status === 'found') {
    const moved = await deps.db.updateTrackingRatingKey(
      ratingKey,
      current.ratingKey,
    )
    deps.logger.info(
      { ratingKey, currentKey: current.ratingKey, moved },
      `Rating key ${ratingKey} is gone from Plex, moved its tracking to ${current.ratingKey}`,
    )
    return { outcome: 'relocated', ratingKey: current.ratingKey }
  }

  const deleted = await deps.db.cleanupRatingKeyTracking(ratingKey)
  deps.logger.info(
    { ratingKey, deleted },
    `Rating key ${ratingKey} is gone from Plex and its content was not found, dropped its tracking`,
  )
  return { outcome: 'deleted' }
}

type CurrentRatingKey =
  | { status: 'found'; ratingKey: string }
  | { status: 'none' }
  | { status: 'error' }

async function findCurrentRatingKey(
  deps: StaleRatingKeyDeps,
  staleKey: string,
  contentGuids: string[],
): Promise<CurrentRatingKey> {
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
      const lookup = await deps.plexServer.lookupByGuid(plexGuid)
      if (lookup.status === 'error') return { status: 'error' }
      if (lookup.status === 'none') continue
      const match = lookup.items.find((item) => item.ratingKey !== staleKey)
      if (match) return { status: 'found', ratingKey: match.ratingKey }
    }
  }

  return { status: 'none' }
}
