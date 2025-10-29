import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import type { TagCache } from '@services/delete-sync/cache/index.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
import type { SonarrManagerService } from '@services/sonarr-manager.service.js'
import { parseGuids } from '@utils/guid-handler.js'
import type { FastifyBaseLogger } from 'fastify'
import { getRemovalTagPrefixNormalized } from './tag-matcher.js'

/**
 * Configuration needed for tag counting
 */
export interface TagCountConfig {
  deleteEndedShow: boolean
  deleteContinuingShow: boolean
  deleteMovie: boolean
  enablePlexPlaylistProtection: boolean
  removedTagPrefix: string | undefined
  deleteSyncRequiredTagRegex?: string
}

/**
 * Count series that have the removal tag
 *
 * @param series - Array of all series
 * @param config - Tag count configuration
 * @param sonarrManager - Sonarr manager service
 * @param tagCache - Tag cache instance
 * @param protectedGuids - Set of protected GUIDs
 * @param isAnyGuidProtected - Function to check if GUID is protected
 * @param logger - Logger instance
 * @returns Promise resolving to count of series with removal tag
 */
export async function countTaggedSeries(
  series: SonarrItem[],
  config: TagCountConfig,
  sonarrManager: SonarrManagerService,
  tagCache: TagCache,
  protectedGuids: Set<string> | null,
  isAnyGuidProtected: (guidList: string[]) => boolean,
  logger: FastifyBaseLogger,
): Promise<number> {
  let count = 0
  let processed = 0

  // Quick exit if both continuing and ended show deletions are disabled
  if (!config.deleteEndedShow && !config.deleteContinuingShow) {
    return 0
  }

  // Group series by instance for efficient processing
  const seriesByInstance = new Map<number, SonarrItem[]>()

  for (const show of series) {
    // Respect configured show types
    const isContinuing = show.series_status !== 'ended'
    const shouldConsider = isContinuing
      ? config.deleteContinuingShow
      : config.deleteEndedShow
    if (!shouldConsider) continue

    if (show.sonarr_instance_id) {
      if (!seriesByInstance.has(show.sonarr_instance_id)) {
        seriesByInstance.set(show.sonarr_instance_id, [])
      }
      seriesByInstance.get(show.sonarr_instance_id)?.push(show)
    }
  }

  // Process each instance
  for (const [instanceId, instanceSeries] of seriesByInstance.entries()) {
    const service = sonarrManager.getSonarrService(instanceId)
    if (!service) {
      logger.warn(
        `Sonarr service for instance ${instanceId} not found, skipping tag count`,
      )
      continue
    }

    // Get tags from cache (reusing existing cache infrastructure)
    const tagMap = await tagCache.getTagsForInstance(
      instanceId,
      service,
      'sonarr',
      logger,
    )
    const removalTagPrefix = getRemovalTagPrefixNormalized(
      config.removedTagPrefix,
    )
    if (!removalTagPrefix) {
      // Avoid treating every tag as a removal tag when prefix is blank
      processed += instanceSeries.length
      continue
    }
    const removedTagIdSet = new Set(
      Array.from(tagMap.entries())
        .filter(([, label]) => label.startsWith(removalTagPrefix))
        .map(([id]) => id),
    )

    if (removedTagIdSet.size === 0) {
      // No matching tags in this instance
      processed += instanceSeries.length
      continue
    }

    // Compile regex if required tag pattern is configured
    const regex = config.deleteSyncRequiredTagRegex
      ? tagCache.getCompiledRegex(config.deleteSyncRequiredTagRegex)
      : null

    // Process each series (all operations are synchronous)
    for (const show of instanceSeries) {
      try {
        const showTags = show.tags || []
        const hasRemoval = showTags.some((id) => removedTagIdSet.has(id))
        if (!hasRemoval) continue

        // Check if the show has a tag matching the required regex pattern
        if (regex) {
          const hasRequired = showTags.some((id) => {
            const label = tagMap.get(id)
            return label ? regex.test(label) : false
          })
          if (!hasRequired) continue
        }

        if (config.enablePlexPlaylistProtection && protectedGuids) {
          const guids = parseGuids(show.guids)
          // Count only if NOT protected
          if (isAnyGuidProtected(guids)) continue
        }

        count++
      } catch (error) {
        logger.error(
          {
            error: error instanceof Error ? error : new Error(String(error)),
            show: { title: show.title, guids: show.guids },
          },
          `Error checking tags for series "${show.title}":`,
        )
      }
    }

    processed += instanceSeries.length

    logger.debug(
      `Checked ${processed} series for removal tag, found ${count} tagged`,
    )
  }

  return count
}

/**
 * Count movies that have the removal tag
 *
 * @param movies - Array of all movies
 * @param config - Tag count configuration
 * @param radarrManager - Radarr manager service
 * @param tagCache - Tag cache instance
 * @param protectedGuids - Set of protected GUIDs
 * @param isAnyGuidProtected - Function to check if GUID is protected
 * @param logger - Logger instance
 * @returns Promise resolving to count of movies with removal tag
 */
export async function countTaggedMovies(
  movies: RadarrItem[],
  config: TagCountConfig,
  radarrManager: RadarrManagerService,
  tagCache: TagCache,
  protectedGuids: Set<string> | null,
  isAnyGuidProtected: (guidList: string[]) => boolean,
  logger: FastifyBaseLogger,
): Promise<number> {
  let count = 0
  let processed = 0

  if (!config.deleteMovie) {
    return 0
  }

  // Group movies by instance for efficient processing
  const moviesByInstance = new Map<number, RadarrItem[]>()

  for (const movie of movies) {
    if (movie.radarr_instance_id) {
      if (!moviesByInstance.has(movie.radarr_instance_id)) {
        moviesByInstance.set(movie.radarr_instance_id, [])
      }
      moviesByInstance.get(movie.radarr_instance_id)?.push(movie)
    }
  }

  // Process each instance
  for (const [instanceId, instanceMovies] of moviesByInstance.entries()) {
    const service = radarrManager.getRadarrService(instanceId)
    if (!service) {
      logger.warn(
        `Radarr service for instance ${instanceId} not found, skipping tag count`,
      )
      continue
    }

    // Get tags from cache (reusing existing cache infrastructure)
    const tagMap = await tagCache.getTagsForInstance(
      instanceId,
      service,
      'radarr',
      logger,
    )
    const removalTagPrefix = getRemovalTagPrefixNormalized(
      config.removedTagPrefix,
    )
    if (!removalTagPrefix) {
      // Avoid treating every tag as a removal tag when prefix is blank
      processed += instanceMovies.length
      continue
    }
    const removedTagIdSet = new Set(
      Array.from(tagMap.entries())
        .filter(([, label]) => label.startsWith(removalTagPrefix))
        .map(([id]) => id),
    )

    if (removedTagIdSet.size === 0) {
      // No matching tags in this instance
      processed += instanceMovies.length
      continue
    }

    // Compile regex if required tag pattern is configured
    const regex = config.deleteSyncRequiredTagRegex
      ? tagCache.getCompiledRegex(config.deleteSyncRequiredTagRegex)
      : null

    // Process each movie (all operations are synchronous)
    for (const movie of instanceMovies) {
      try {
        const movieTags = movie.tags || []
        const hasRemoval = movieTags.some((id) => removedTagIdSet.has(id))
        if (!hasRemoval) continue

        // Check if the movie has a tag matching the required regex pattern
        if (regex) {
          const hasRequired = movieTags.some((id) => {
            const label = tagMap.get(id)
            return label ? regex.test(label) : false
          })
          if (!hasRequired) continue
        }

        if (config.enablePlexPlaylistProtection && protectedGuids) {
          const guids = parseGuids(movie.guids)
          // Count only if NOT protected
          if (isAnyGuidProtected(guids)) continue
        }

        count++
      } catch (error) {
        logger.error(
          {
            error: error instanceof Error ? error : new Error(String(error)),
            movie: { title: movie.title, guids: movie.guids },
          },
          `Error checking tags for movie "${movie.title}":`,
        )
      }
    }

    processed += instanceMovies.length

    logger.debug(
      `Checked ${processed} movies for removal tag, found ${count} tagged`,
    )
  }

  return count
}
