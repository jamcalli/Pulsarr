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
  deleteSyncTrackedOnly: boolean
  removedTagPrefix: string | undefined
  deleteSyncRequiredTagRegex?: string
  /**
   * GUIDs that exclusions designate for deletion; counted alongside
   * tag-matched items so the safety check arithmetic stays accurate.
   */
  exclusionDrivenGuids?: Set<string>
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
 * @param trackedGuids - Set of tracked GUIDs (for tracked-only mode)
 * @param isAnyGuidTracked - Function to check if GUID is tracked
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
  trackedGuids: Set<string> | null,
  isAnyGuidTracked: (guidList: string[]) => boolean,
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
    const removedTagIdSet = removalTagPrefix
      ? new Set(
          Array.from(tagMap.entries())
            .filter(([, label]) => label.startsWith(removalTagPrefix))
            .map(([id]) => id),
        )
      : new Set<number>()

    const hasExclusionDriven = (config.exclusionDrivenGuids?.size ?? 0) > 0

    // Skip the instance only if there's no way for any item to qualify:
    // no removal-tag mechanism AND no exclusion-driven candidates to consider.
    if (removedTagIdSet.size === 0 && !hasExclusionDriven) {
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
        const guids = parseGuids(show.guids)

        const isExclusionDriven = hasExclusionDriven
          ? guids.some((g) => config.exclusionDrivenGuids?.has(g))
          : false
        const hasRemoval =
          removedTagIdSet.size > 0 &&
          showTags.some((id) => removedTagIdSet.has(id))

        if (!hasRemoval && !isExclusionDriven) continue

        // The required-regex filter scopes tag-based candidates; bypass for
        // exclusion-driven candidates (mirror of validator behavior).
        if (regex && !isExclusionDriven) {
          const hasRequired = showTags.some((id) => {
            const label = tagMap.get(id)
            return label ? regex.test(label) : false
          })
          if (!hasRequired) continue
        }

        if (config.enablePlexPlaylistProtection && protectedGuids) {
          // Count only if NOT protected
          if (isAnyGuidProtected(guids)) continue
        }

        // Check tracked-only deletion
        if (config.deleteSyncTrackedOnly && trackedGuids) {
          // Count only if tracked
          if (!isAnyGuidTracked(guids)) continue
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
      `Checked ${processed} series for removal tag or exclusion-driven deletion, found ${count} candidates`,
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
 * @param trackedGuids - Set of tracked GUIDs (for tracked-only mode)
 * @param isAnyGuidTracked - Function to check if GUID is tracked
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
  trackedGuids: Set<string> | null,
  isAnyGuidTracked: (guidList: string[]) => boolean,
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
    const removedTagIdSet = removalTagPrefix
      ? new Set(
          Array.from(tagMap.entries())
            .filter(([, label]) => label.startsWith(removalTagPrefix))
            .map(([id]) => id),
        )
      : new Set<number>()

    const hasExclusionDriven = (config.exclusionDrivenGuids?.size ?? 0) > 0

    // Skip the instance only if there's no way for any item to qualify:
    // no removal-tag mechanism AND no exclusion-driven candidates to consider.
    if (removedTagIdSet.size === 0 && !hasExclusionDriven) {
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
        const guids = parseGuids(movie.guids)

        const isExclusionDriven = hasExclusionDriven
          ? guids.some((g) => config.exclusionDrivenGuids?.has(g))
          : false
        const hasRemoval =
          removedTagIdSet.size > 0 &&
          movieTags.some((id) => removedTagIdSet.has(id))

        if (!hasRemoval && !isExclusionDriven) continue

        // The required-regex filter scopes tag-based candidates; bypass for
        // exclusion-driven candidates (mirror of validator behavior).
        if (regex && !isExclusionDriven) {
          const hasRequired = movieTags.some((id) => {
            const label = tagMap.get(id)
            return label ? regex.test(label) : false
          })
          if (!hasRequired) continue
        }

        if (config.enablePlexPlaylistProtection && protectedGuids) {
          // Count only if NOT protected
          if (isAnyGuidProtected(guids)) continue
        }

        // Check tracked-only deletion
        if (config.deleteSyncTrackedOnly && trackedGuids) {
          // Count only if tracked
          if (!isAnyGuidTracked(guids)) continue
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
      `Checked ${processed} movies for removal tag or exclusion-driven deletion, found ${count} candidates`,
    )
  }

  return count
}
