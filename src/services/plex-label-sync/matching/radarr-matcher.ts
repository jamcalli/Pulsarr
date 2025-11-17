/**
 * Radarr Matcher
 *
 * Matches Plex movies to Radarr movies based on file paths.
 */

import type { RadarrMovieWithTags } from '@root/types/plex-label-sync.types.js'
import type { PlexServerService } from '@services/plex-server.service.js'
import { normalizePath } from '@utils/path.js'
import type { FastifyBaseLogger } from 'fastify'

/**
 * Matches a Plex movie to a Radarr movie based on file paths
 *
 * @param plexItem - The Plex movie item with ratingKey and title
 * @param radarrMovies - Array of Radarr movies with tags
 * @param plexServer - Plex server service to fetch metadata
 * @param logger - Logger instance
 * @returns Matched Radarr movie data or null
 */
export async function matchPlexMovieToRadarr(
  plexItem: { ratingKey: string; title: string },
  radarrMovies: RadarrMovieWithTags[],
  plexServer: PlexServerService,
  logger: FastifyBaseLogger,
): Promise<RadarrMovieWithTags | null> {
  try {
    const metadata = await plexServer.getMetadata(plexItem.ratingKey)
    if (!metadata?.Media) {
      logger.debug(
        {
          ratingKey: plexItem.ratingKey,
          title: plexItem.title,
        },
        'No media information found for Plex movie',
      )
      return null
    }

    // Extract all file paths from Plex movie
    const plexFilePaths: string[] = []
    for (const media of metadata.Media) {
      for (const part of media.Part || []) {
        if (part.file) {
          plexFilePaths.push(part.file)
        }
      }
    }

    logger.debug(
      {
        ratingKey: plexItem.ratingKey,
        title: plexItem.title,
        plexFilePaths,
        radarrMovieCount: radarrMovies.length,
      },
      'Matching Plex movie to Radarr',
    )

    // Try to match by exact file path
    for (const radarrData of radarrMovies) {
      const movieFilePath = radarrData.movie.movieFile?.path
      if (!movieFilePath) {
        continue
      }

      // Normalize paths for cross-platform compatibility

      if (
        plexFilePaths.map(normalizePath).includes(normalizePath(movieFilePath))
      ) {
        logger.debug(
          {
            plexTitle: plexItem.title,
            radarrTitle: radarrData.movie.title,
            filePath: movieFilePath,
            instanceName: radarrData.instanceName,
            tags: radarrData.tags,
          },
          'Found exact file path match',
        )
        return radarrData
      }
    }

    logger.debug(
      {
        ratingKey: plexItem.ratingKey,
        title: plexItem.title,
        plexFilePaths,
      },
      'No Radarr match found for Plex movie',
    )
    return null
  } catch (error) {
    logger.error({ error }, 'Error matching Plex movie to Radarr:')
    return null
  }
}
