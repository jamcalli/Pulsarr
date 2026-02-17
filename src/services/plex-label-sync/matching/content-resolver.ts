/**
 * Content Resolver
 *
 * Resolves content items to actual Plex items, filtering out content not yet available.
 */

import type {
  ContentWithUsers,
  PlexContentItems,
} from '@root/types/plex-label-sync.types.js'
import type { PlexServerService } from '@services/plex-server.service.js'
import { buildPlexGuid } from '@utils/guid-handler.js'
import type { FastifyBaseLogger } from 'fastify'

/**
 * Resolves content items to actual Plex items, filtering out content not yet available.
 *
 * @param contentItems - Array of content items to resolve
 * @param plexServer - Plex server service
 * @param logger - Logger instance
 * @returns Object containing available and unavailable content
 */
export async function resolveContentToPlexItems(
  contentItems: ContentWithUsers[],
  plexServer: PlexServerService,
  logger: FastifyBaseLogger,
): Promise<{
  available: PlexContentItems[]
  unavailable: ContentWithUsers[]
}> {
  const available: PlexContentItems[] = []
  const unavailable: ContentWithUsers[] = []

  for (const content of contentItems) {
    if (!content.plexKey) {
      logger.debug(
        {
          primaryGuid: content.primaryGuid,
          title: content.title,
        },
        'Content item missing Plex key, marking as unavailable',
      )
      unavailable.push(content)
      continue
    }

    try {
      // Construct full GUID and search for the content in Plex
      const contentType = content.type || 'movie'
      const fullGuid = buildPlexGuid(
        contentType === 'show' ? 'show' : 'movie',
        content.plexKey,
      )

      logger.debug(
        {
          primaryGuid: content.primaryGuid,
          title: content.title,
          plexKey: content.plexKey,
          fullGuid,
          contentType,
        },
        'Resolving content to Plex items',
      )

      const plexItems = await plexServer.searchByGuid(fullGuid)

      if (plexItems.length === 0) {
        logger.debug(
          {
            primaryGuid: content.primaryGuid,
            title: content.title,
            fullGuid,
          },
          'Content not found in Plex library',
        )
        unavailable.push(content)
      } else {
        logger.debug(
          {
            primaryGuid: content.primaryGuid,
            title: content.title,
            plexItemCount: plexItems.length,
            ratingKeys: plexItems.map((item) => item.ratingKey),
          },
          'Found content in Plex library',
        )
        available.push({
          content,
          plexItems: plexItems.map((item) => ({
            ratingKey: item.ratingKey,
            title: item.title,
          })),
        })
      }
    } catch (error) {
      logger.error(
        {
          primaryGuid: content.primaryGuid,
          title: content.title,
          error,
        },
        'Error resolving content to Plex items',
      )
      unavailable.push(content)
    }
  }

  logger.debug(
    {
      totalContent: contentItems.length,
      foundInPlex: available.length,
      waitingForDownload: unavailable.length,
    },
    'Plex library scan completed',
  )

  return { available, unavailable }
}
