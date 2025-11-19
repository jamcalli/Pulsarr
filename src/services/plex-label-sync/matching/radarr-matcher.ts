/**
 * Radarr Matcher
 *
 * Matches Plex movies to Radarr movies based on file paths.
 */

import type { RadarrMovieWithTags } from '@root/types/plex-label-sync.types.js'
import type { PlexServerService } from '@services/plex-server.service.js'
import { normalizePath } from '@utils/path.js'
import type { FastifyBaseLogger } from 'fastify'

// Cache for file path-based lookups (built once per batch sync)
let radarrFilePathMapCache: Map<string, RadarrMovieWithTags> | null = null

/**
 * Builds optimized lookup map for Radarr movie matching.
 * Called once at the start of batch sync to avoid O(n*m) complexity.
 *
 * @param radarrMovies - Array of Radarr movies with tags
 */
export function buildRadarrMatchingCache(
  radarrMovies: RadarrMovieWithTags[],
): void {
  radarrFilePathMapCache = new Map()
  for (const radarrData of radarrMovies) {
    const movieFilePath = radarrData.movie.movieFile?.path
    if (movieFilePath) {
      const normalizedPath = normalizePath(movieFilePath)
      radarrFilePathMapCache.set(normalizedPath, radarrData)
    }
  }
}

/**
 * Clears the Radarr matching cache. Called at the end of batch sync.
 */
export function clearRadarrMatchingCache(): void {
  radarrFilePathMapCache = null
}

/**
 * Matches a Plex movie to a Radarr movie based on file paths.
 * Uses optimized Map-based lookups for O(1) performance.
 *
 * If the matching cache has not been pre-built, it will be constructed on demand
 * from the radarrMovies parameter to ensure matching always works.
 *
 * @param plexItem - The Plex movie item with ratingKey and title
 * @param radarrMovies - Array of Radarr movies with tags (used to build cache if not already initialized)
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
    // Build cache on demand if not already initialized
    if (!radarrFilePathMapCache && radarrMovies.length > 0) {
      logger.debug(
        {
          radarrMovieCount: radarrMovies.length,
        },
        'Cache not initialized, building on demand',
      )
      buildRadarrMatchingCache(radarrMovies)
    }

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
          plexFilePaths.push(normalizePath(part.file))
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

    if (!plexFilePaths.length) {
      return null
    }

    // Try to match by exact file path using cache (O(1) lookup per path)
    if (radarrFilePathMapCache) {
      for (const plexFilePath of plexFilePaths) {
        const match = radarrFilePathMapCache.get(plexFilePath)
        if (match) {
          logger.debug(
            {
              plexTitle: plexItem.title,
              radarrTitle: match.movie.title,
              filePath: plexFilePath,
              instanceName: match.instanceName,
              tags: match.tags,
            },
            'Found exact file path match',
          )
          return match
        }
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
