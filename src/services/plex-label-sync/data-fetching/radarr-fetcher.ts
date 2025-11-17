/**
 * Radarr Data Fetcher
 *
 * Handles fetching movie data and tags from Radarr instances.
 */

import type { RadarrMovieWithTags } from '@root/types/plex-label-sync.types.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
import type { FastifyBaseLogger } from 'fastify'
import pLimit from 'p-limit'

/**
 * Fetches all movies from Radarr instances with their tags
 *
 * @param radarrManager - Radarr manager service
 * @param tagSyncEnabled - Whether tag sync is enabled
 * @param syncRadarrTags - Whether to sync Radarr tags specifically
 * @param logger - Logger instance
 * @returns Array of movies with tags from all Radarr instances
 */
export async function fetchAllRadarrMovies(
  radarrManager: RadarrManagerService,
  tagSyncEnabled: boolean,
  syncRadarrTags: boolean,
  logger: FastifyBaseLogger,
): Promise<RadarrMovieWithTags[]> {
  if (!tagSyncEnabled || !syncRadarrTags) {
    return []
  }

  try {
    logger.debug(
      'Fetching all Radarr movies for tag sync from individual services',
    )
    const processedMovies: RadarrMovieWithTags[] = []

    const instances = await radarrManager.getAllInstances()

    const limit = pLimit(4)
    await Promise.all(
      instances.map((instance) =>
        limit(async () => {
          try {
            const radarrService = radarrManager.getRadarrService(instance.id)
            if (!radarrService) {
              logger.warn(
                `Could not get Radarr service for instance ${instance.id}`,
              )
              return
            }

            const instanceMovies = await radarrService.getAllMovies()
            const instanceTags = await radarrService.getTags()

            const tagMap = new Map(
              instanceTags.map((tag: { id: number; label: string }) => [
                tag.id,
                tag.label,
              ]),
            )

            for (const movie of instanceMovies) {
              const tags =
                movie.tags
                  ?.map((tagId: number) => tagMap.get(tagId))
                  .filter((tag): tag is string => Boolean(tag)) || []

              processedMovies.push({
                instanceId: instance.id,
                instanceName: instance.name,
                movie,
                tags,
              })
            }

            logger.debug(
              `Processed ${instanceMovies.length} movies from instance ${instance.name}`,
            )
          } catch (error) {
            logger.error(
              { error },
              `Error processing movies from instance ${instance.id} (${instance.name}):`,
            )
          }
        }),
      ),
    )

    logger.info(`Processed ${processedMovies.length} total movies for tag sync`)
    return processedMovies
  } catch (error) {
    logger.error({ error }, 'Error fetching Radarr movies for tag sync:')
    return []
  }
}

/**
 * Fetches tags for a specific movie from targeted Radarr instances using TMDB ID lookup
 *
 * @param radarrManager - Radarr manager service
 * @param instanceIds - Array of Radarr instance IDs to check
 * @param tmdbId - TMDB ID of the movie
 * @param title - Movie title for logging
 * @param isUserTaggingSystemTag - Function to check if a tag is a system tag
 * @param logger - Logger instance
 * @returns Array of tag names found for this movie
 */
export async function fetchRadarrTagsForItem(
  radarrManager: RadarrManagerService,
  instanceIds: number[],
  tmdbId: number,
  title: string,
  isUserTaggingSystemTag: (tagName: string) => boolean,
  logger: FastifyBaseLogger,
): Promise<string[]> {
  for (const instanceId of instanceIds) {
    try {
      const radarrService = radarrManager.getRadarrService(instanceId)
      if (!radarrService) {
        logger.warn(`Could not get Radarr service for instance ${instanceId}`)
        continue
      }

      // Use the targeted lookup to find the movie
      const movies = await radarrService.getFromRadarr<
        Array<{ id: number; title: string; tags?: number[] }>
      >(`movie/lookup?term=tmdb:${tmdbId}`)

      if (movies.length > 0 && movies[0].id > 0) {
        const movie = movies[0]

        if (movie.tags && movie.tags.length > 0) {
          // Fetch tag definitions to convert IDs to names
          const tagDefinitions = await radarrService.getTags()
          const tagMap = new Map(
            tagDefinitions.map((tag) => [tag.id, tag.label]),
          )

          const tagNames = movie.tags
            .map((tagId: number) => tagMap.get(tagId))
            .filter((tag: string | undefined) => Boolean(tag)) as string[]

          // Filter out user tagging system tags
          const filteredTags = tagNames.filter(
            (tag) => !isUserTaggingSystemTag(tag),
          )

          logger.debug(
            {
              instanceId,
              tmdbId,
              title,
              movieTitle: movie.title,
              tagIds: movie.tags,
              tagNames: filteredTags,
            },
            'Found Radarr tags for movie using targeted lookup',
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
        `Error fetching tags from Radarr instance ${instanceId}`,
      )
    }
  }

  return []
}
