/**
 * Sonarr Data Fetcher
 *
 * Handles fetching series data and tags from Sonarr instances.
 */

import type { SonarrSeriesWithTags } from '@root/types/plex-label-sync.types.js'
import type { SonarrManagerService } from '@services/sonarr-manager.service.js'
import type { FastifyBaseLogger } from 'fastify'
import pLimit from 'p-limit'

/**
 * Fetches all series from Sonarr instances with their tags
 *
 * @param sonarrManager - Sonarr manager service
 * @param tagSyncEnabled - Whether tag sync is enabled
 * @param syncSonarrTags - Whether to sync Sonarr tags specifically
 * @param logger - Logger instance
 * @returns Array of series with tags from all Sonarr instances
 */
export async function fetchAllSonarrSeries(
  sonarrManager: SonarrManagerService,
  tagSyncEnabled: boolean,
  syncSonarrTags: boolean,
  logger: FastifyBaseLogger,
): Promise<SonarrSeriesWithTags[]> {
  if (!tagSyncEnabled || !syncSonarrTags) {
    return []
  }

  try {
    logger.debug(
      'Fetching all Sonarr series for tag sync from individual services',
    )
    const processedSeries: SonarrSeriesWithTags[] = []

    const instances = await sonarrManager.getAllInstances()

    const limit = pLimit(4)
    await Promise.all(
      instances.map((instance) =>
        limit(async () => {
          try {
            const sonarrService = sonarrManager.getSonarrService(instance.id)
            if (!sonarrService) {
              logger.warn(
                `Could not get Sonarr service for instance ${instance.id}`,
              )
              return
            }

            const instanceSeries = await sonarrService.getAllSeries()
            const [instanceTags, rootFolders] = await Promise.all([
              sonarrService.getTags(),
              sonarrService.fetchRootFolders(),
            ])

            const tagMap = new Map(
              instanceTags.map((tag: { id: number; label: string }) => [
                tag.id,
                tag.label,
              ]),
            )

            const rootFolder =
              rootFolders.length > 0 ? rootFolders[0].path : undefined

            for (const series of instanceSeries) {
              const tags =
                series.tags
                  ?.map((tagId: number) => tagMap.get(tagId))
                  .filter((tag): tag is string => Boolean(tag)) || []

              processedSeries.push({
                instanceId: instance.id,
                instanceName: instance.name,
                series,
                tags,
                rootFolder,
              })
            }

            logger.debug(
              `Processed ${instanceSeries.length} series from instance ${instance.name}`,
            )
          } catch (error) {
            logger.error(
              { error },
              `Error processing series from instance ${instance.id} (${instance.name}):`,
            )
          }
        }),
      ),
    )

    logger.info(`Processed ${processedSeries.length} total series for tag sync`)
    return processedSeries
  } catch (error) {
    logger.error({ error }, 'Error fetching Sonarr series for tag sync:')
    return []
  }
}

/**
 * Fetches tags for a specific series from targeted Sonarr instances using TVDB ID lookup
 *
 * @param sonarrManager - Sonarr manager service
 * @param instanceIds - Array of Sonarr instance IDs to check
 * @param tvdbId - TVDB ID of the series
 * @param title - Series title for logging
 * @param isUserTaggingSystemTag - Function to check if a tag is a system tag
 * @param logger - Logger instance
 * @returns Array of tag names found for this series
 */
export async function fetchSonarrTagsForItem(
  sonarrManager: SonarrManagerService,
  instanceIds: number[],
  tvdbId: number,
  title: string,
  isUserTaggingSystemTag: (tagName: string) => boolean,
  logger: FastifyBaseLogger,
): Promise<string[]> {
  for (const instanceId of instanceIds) {
    try {
      const sonarrService = sonarrManager.getSonarrService(instanceId)
      if (!sonarrService) {
        logger.warn(`Could not get Sonarr service for instance ${instanceId}`)
        continue
      }

      // Use the targeted lookup to find the series
      const series = await sonarrService.getFromSonarr<
        Array<{ id: number; title: string; tags?: number[] }>
      >(`series/lookup?term=tvdb:${tvdbId}`)

      if (series.length > 0 && series[0].id > 0) {
        const show = series[0]

        if (show.tags && show.tags.length > 0) {
          // Fetch tag definitions to convert IDs to names
          const tagDefinitions = await sonarrService.getTags()
          const tagMap = new Map(
            tagDefinitions.map((tag) => [tag.id, tag.label]),
          )

          const tagNames = show.tags
            .map((tagId: number) => tagMap.get(tagId))
            .filter((tag: string | undefined) => Boolean(tag)) as string[]

          // Filter out user tagging system tags
          const filteredTags = tagNames.filter(
            (tag) => !isUserTaggingSystemTag(tag),
          )

          logger.debug(
            {
              instanceId,
              tvdbId,
              title,
              seriesTitle: show.title,
              tagIds: show.tags,
              tagNames: filteredTags,
            },
            'Found Sonarr tags for series using targeted lookup',
          )

          return filteredTags
        }
      }
    } catch (error) {
      logger.warn(
        {
          error,
          instanceId,
        },
        `Error fetching tags from Sonarr instance ${instanceId}`,
      )
    }
  }

  return []
}
