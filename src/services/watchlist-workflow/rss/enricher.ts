/**
 * RSS Item Enricher
 *
 * Enriches RSS items by looking up Plex metadata via GUID.
 * Used by both self and friends RSS processors.
 */

import type { Config } from '@root/types/config.types.js'
import type { CachedRssItem, Item } from '@root/types/plex.types.js'
import {
  lookupByGuid,
  selectPrimaryGuid,
} from '@services/plex-watchlist/index.js'
import type { FastifyBaseLogger } from 'fastify'

/**
 * Dependencies for RSS enrichment
 */
export interface RssEnricherDeps {
  logger: FastifyBaseLogger
  config: Config
}

/**
 * Enrich RSS items by looking up Plex rating keys via GUID.
 * Items that fail enrichment are skipped.
 *
 * @param items - Cached RSS items to enrich
 * @param userId - User ID to associate with enriched items
 * @param deps - Dependencies
 * @returns Enriched items with full Plex metadata
 */
export async function enrichRssItems(
  items: CachedRssItem[],
  userId: number,
  deps: RssEnricherDeps,
): Promise<Item[]> {
  const token = deps.config.plexTokens?.[0]
  if (!token) {
    deps.logger.warn('No Plex token for RSS item enrichment')
    return []
  }

  const enrichedItems: Item[] = []

  for (const item of items) {
    try {
      // Select best GUID for lookup
      const primaryGuid = selectPrimaryGuid(item.guids, item.type)
      if (!primaryGuid) {
        deps.logger.debug(
          { title: item.title, guids: item.guids },
          'No usable GUID for RSS item',
        )
        continue
      }

      // Look up full Plex metadata including rating key
      const metadata = await lookupByGuid(
        { token },
        deps.logger,
        primaryGuid,
        item.type,
      )

      if (!metadata) {
        deps.logger.debug(
          { title: item.title, guid: primaryGuid },
          'Could not enrich RSS item via GUID lookup',
        )
        continue
      }

      // Build Item with enriched data
      enrichedItems.push({
        title: metadata.title || item.title,
        key: metadata.ratingKey,
        type: item.type.toUpperCase(),
        thumb: metadata.thumb || item.thumb || '',
        guids: metadata.guids.length > 0 ? metadata.guids : item.guids,
        genres: metadata.genres.length > 0 ? metadata.genres : item.genres,
        user_id: userId,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    } catch (error) {
      deps.logger.warn({ error, title: item.title }, 'Error enriching RSS item')
    }
  }

  deps.logger.debug(
    { enriched: enrichedItems.length, total: items.length },
    'RSS items enriched',
  )

  return enrichedItems
}
