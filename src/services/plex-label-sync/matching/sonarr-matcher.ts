/**
 * Sonarr Matcher
 *
 * Matches Plex series to Sonarr series based on folder paths.
 */

import type { SonarrSeriesWithTags } from '@root/types/plex-label-sync.types.js'
import type { PlexServerService } from '@services/plex-server.service.js'
import { getPathBasename, normalizePath } from '@utils/path.js'
import type { FastifyBaseLogger } from 'fastify'

/**
 * Matches a Plex series to a Sonarr series based on folder paths
 *
 * @param plexItem - The Plex series item with ratingKey and title
 * @param sonarrSeries - Array of Sonarr series with tags
 * @param plexServer - Plex server service to fetch metadata
 * @param logger - Logger instance
 * @returns Matched Sonarr series data or null
 */
export async function matchPlexSeriesToSonarr(
  plexItem: { ratingKey: string; title: string },
  sonarrSeries: SonarrSeriesWithTags[],
  plexServer: PlexServerService,
  logger: FastifyBaseLogger,
): Promise<SonarrSeriesWithTags | null> {
  try {
    const metadata = await plexServer.getMetadata(plexItem.ratingKey)
    if (!metadata) {
      logger.debug(
        {
          ratingKey: plexItem.ratingKey,
          title: plexItem.title,
        },
        'No metadata found for Plex series',
      )
      return null
    }

    const plexLocation = metadata.Location?.[0]?.path
    const normalizedPlexLocation = plexLocation
      ? normalizePath(plexLocation)
      : ''

    logger.debug(
      {
        ratingKey: plexItem.ratingKey,
        title: plexItem.title,
        plexLocation,
        sonarrSeriesCount: sonarrSeries.length,
      },
      'Matching Plex series to Sonarr',
    )

    // Try to match by root folder
    if (normalizedPlexLocation) {
      for (const sonarrData of sonarrSeries) {
        if (sonarrData.rootFolder) {
          const normalizedRoot = normalizePath(sonarrData.rootFolder)
          const rootWithSep = normalizedRoot.endsWith('/')
            ? normalizedRoot
            : `${normalizedRoot}/`

          if (
            normalizedPlexLocation === normalizedRoot ||
            normalizedPlexLocation.startsWith(rootWithSep)
          ) {
            logger.debug(
              {
                plexTitle: plexItem.title,
                sonarrTitle: sonarrData.series.title,
                plexLocation,
                sonarrRootFolder: sonarrData.rootFolder,
                instanceName: sonarrData.instanceName,
                tags: sonarrData.tags,
              },
              'Found root folder match',
            )
            return {
              instanceId: sonarrData.instanceId,
              instanceName: sonarrData.instanceName,
              series: sonarrData.series,
              tags: sonarrData.tags,
            }
          }
        }
      }
    }

    // Try to match by exact folder path
    if (normalizedPlexLocation) {
      for (const sonarrData of sonarrSeries) {
        if (
          normalizedPlexLocation === normalizePath(sonarrData.series.path || '')
        ) {
          logger.debug(
            {
              plexTitle: plexItem.title,
              sonarrTitle: sonarrData.series.title,
              plexLocation,
              sonarrSeriesPath: sonarrData.series.path,
              instanceName: sonarrData.instanceName,
              tags: sonarrData.tags,
            },
            'Found exact folder path match',
          )
          return {
            instanceId: sonarrData.instanceId,
            instanceName: sonarrData.instanceName,
            series: sonarrData.series,
            tags: sonarrData.tags,
          }
        }
      }
    }

    // Try to match by folder name
    if (normalizedPlexLocation) {
      for (const sonarrData of sonarrSeries) {
        const sonarrFolderName = getPathBasename(
          sonarrData.series.path || '',
        ).toLowerCase()
        const plexFolderName = getPathBasename(
          normalizedPlexLocation,
        ).toLowerCase()

        if (sonarrFolderName && plexFolderName === sonarrFolderName) {
          logger.debug(
            {
              plexTitle: plexItem.title,
              sonarrTitle: sonarrData.series.title,
              plexLocation,
              sonarrFolderName,
              instanceName: sonarrData.instanceName,
              tags: sonarrData.tags,
            },
            'Found folder name match',
          )
          return {
            instanceId: sonarrData.instanceId,
            instanceName: sonarrData.instanceName,
            series: sonarrData.series,
            tags: sonarrData.tags,
          }
        }
      }
    }

    // Log available paths for debugging
    try {
      logger.debug(
        {
          plexTitle: plexItem.title,
          plexLocation,
          availableSonarrPaths: sonarrSeries.map((s) => ({
            instanceName: s.instanceName,
            seriesPath: s.series.path,
            rootFolder: s.rootFolder,
          })),
        },
        'No match found with available strategies',
      )
    } catch (error) {
      logger.debug({ error }, 'Error during folder matching fallback:')
    }

    logger.debug(
      {
        ratingKey: plexItem.ratingKey,
        title: plexItem.title,
        plexLocation,
      },
      'No Sonarr match found for Plex series',
    )
    return null
  } catch (error) {
    logger.error({ error }, 'Error matching Plex series to Sonarr:')
    return null
  }
}
