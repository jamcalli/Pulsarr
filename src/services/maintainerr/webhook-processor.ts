import { SYSTEM_USER_ID } from '@services/database/methods/watchlist-exclusion.js'
import type { DatabaseService } from '@services/database.service.js'
import { parseGuids } from '@utils/guid-handler.js'
import type { FastifyBaseLogger } from 'fastify'

// Item shape inside the JSON-encoded mediaItems string. type, title and
// providerIds only exist on Maintainerr >= 3.23.0 metadata-snapshot events;
// bare { mediaServerId } entries are skipped
export interface MaintainerrMediaItem {
  mediaServerId: string
  type?: string
  title?: string
  providerIds?: {
    imdb?: string[]
    tmdb?: string[]
    tvdb?: string[]
  }
}

export interface MaintainerrWebhookDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
  // 'watchlisters' excludes current holders only; 'global' writes a
  // system-user veto that blocks everyone
  mode: 'watchlisters' | 'global'
}

function toGuids(providerIds: MaintainerrMediaItem['providerIds']): string[] {
  if (!providerIds || typeof providerIds !== 'object') return []
  const ids = (values: unknown, prefix: string) =>
    Array.isArray(values) ? values.map((id) => `${prefix}:${id}`) : []
  return parseGuids([
    ...ids(providerIds.imdb, 'imdb'),
    ...ids(providerIds.tmdb, 'tmdb'),
    ...ids(providerIds.tvdb, 'tvdb'),
  ])
}

/**
 * Writes watchlist exclusions for media Maintainerr has handled, so the next
 * sync does not regrab it from stale watchlist entries.
 *
 * @returns Number of exclusion rows created (existing rows are skipped)
 */
export async function processMaintainerrHandledItems(
  items: MaintainerrMediaItem[],
  deps: MaintainerrWebhookDeps,
): Promise<{ created: number }> {
  let created = 0

  for (const item of items) {
    if (item === null || typeof item !== 'object') continue

    // Watchlists are movie/show level; season and episode entries carry
    // item-scoped provider ids that cannot key a show-level exclusion
    if (item.type !== 'movie' && item.type !== 'show') continue

    const guids = toGuids(item.providerIds)
    if (guids.length === 0) continue

    const rows = await deps.db.getWatchlistItemsWithUsersByGuids(guids)

    // Type must match too: tmdb/tvdb ids collide across movies and shows
    const byKey = new Map<
      string,
      { userIds: Set<number>; title: string; guids: string[] }
    >()
    for (const row of rows) {
      if (row.type !== item.type) continue
      let entry = byKey.get(row.key)
      if (!entry) {
        entry = { userIds: new Set(), title: row.title, guids: row.guids }
        byKey.set(row.key, entry)
      }
      entry.userIds.add(row.user_id)
    }

    if (byKey.size === 0) {
      deps.logger.debug(
        { title: item.title, guids },
        'Maintainerr handled item matched no watchlist entries',
      )
      continue
    }

    for (const [key, entry] of byKey) {
      const rowsCreated = await deps.db.excludeWatchlistItem(
        key,
        deps.mode === 'global' ? [SYSTEM_USER_ID] : [...entry.userIds],
        entry.title,
        item.type,
        entry.guids,
      )
      created += rowsCreated

      if (rowsCreated > 0) {
        deps.logger.info(
          {
            title: entry.title,
            key,
            mode: deps.mode,
            ...(deps.mode === 'watchlisters'
              ? { userIds: [...entry.userIds] }
              : {}),
          },
          'Created watchlist exclusion for Maintainerr-handled item',
        )
      }
    }
  }

  return { created }
}
