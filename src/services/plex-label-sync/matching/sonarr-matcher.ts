/**
 * Sonarr Matcher
 *
 * Matches Plex series to Sonarr series based on folder paths.
 */

import type { SonarrSeriesWithTags } from '@root/types/plex-label-sync.types.js'
import type { PlexServerService } from '@services/plex-server.service.js'
import { getPathBasename, normalizePath } from '@utils/path.js'
import type { FastifyBaseLogger } from 'fastify'

// Cache for path-based lookups (built once per batch sync)
let sonarrPathMapCache: Map<string, SonarrSeriesWithTags> | null = null
let sonarrFolderNameMapCache: Map<string, SonarrSeriesWithTags> | null = null

/**
 * Builds optimized lookup maps for Sonarr series matching.
 * Called once at the start of batch sync to avoid O(n*m) complexity.
 *
 * @param sonarrSeries - Array of Sonarr series with tags
 */
export function buildSonarrMatchingCache(
  sonarrSeries: SonarrSeriesWithTags[],
): void {
  // Build exact path map
  sonarrPathMapCache = new Map()
  for (const sonarrData of sonarrSeries) {
    if (sonarrData.series.path) {
      const normalizedPath = normalizePath(sonarrData.series.path)
      sonarrPathMapCache.set(normalizedPath, sonarrData)
    }
  }

  // Build folder name map
  sonarrFolderNameMapCache = new Map()
  for (const sonarrData of sonarrSeries) {
    if (sonarrData.series.path) {
      const folderName = getPathBasename(sonarrData.series.path).toLowerCase()
      if (folderName) {
        sonarrFolderNameMapCache.set(folderName, sonarrData)
      }
    }
  }
}

/**
 * Clears the Sonarr matching cache. Called at the end of batch sync.
 */
export function clearSonarrMatchingCache(): void {
  sonarrPathMapCache = null
  sonarrFolderNameMapCache = null
}

/**
 * Matches a Plex series to a Sonarr series based on folder paths.
 * Uses optimized Map-based lookups for O(1) performance.
 *
 * @param plexItem - The Plex series item with ratingKey and title
 * @param sonarrSeries - Array of Sonarr series with tags (only used if cache not built)
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

    if (!normalizedPlexLocation) {
      return null
    }

    // Try exact path match using cache (O(1) lookup)
    if (sonarrPathMapCache) {
      const match = sonarrPathMapCache.get(normalizedPlexLocation)
      if (match) {
        logger.debug(
          {
            plexTitle: plexItem.title,
            sonarrTitle: match.series.title,
            plexLocation,
            sonarrSeriesPath: match.series.path,
            instanceName: match.instanceName,
            tags: match.tags,
          },
          'Found exact folder path match',
        )
        return {
          instanceId: match.instanceId,
          instanceName: match.instanceName,
          series: match.series,
          tags: match.tags,
        }
      }
    }

    // Try folder name match using cache (O(1) lookup)
    if (sonarrFolderNameMapCache) {
      const plexFolderName = getPathBasename(
        normalizedPlexLocation,
      ).toLowerCase()
      if (plexFolderName) {
        const match = sonarrFolderNameMapCache.get(plexFolderName)
        if (match) {
          logger.debug(
            {
              plexTitle: plexItem.title,
              sonarrTitle: match.series.title,
              plexLocation,
              sonarrFolderName: plexFolderName,
              instanceName: match.instanceName,
              tags: match.tags,
            },
            'Found folder name match',
          )
          return {
            instanceId: match.instanceId,
            instanceName: match.instanceName,
            series: match.series,
            tags: match.tags,
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
