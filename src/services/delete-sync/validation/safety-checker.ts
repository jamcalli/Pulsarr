import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import { parseGuids } from '@utils/guid-handler.js'
import type { FastifyBaseLogger } from 'fastify'

export interface SafetyCheckConfig {
  deleteMovie: boolean
  deleteEndedShow: boolean
  deleteContinuingShow: boolean
  maxDeletionPrevention: number | string
}

export interface SafetyCheckResult {
  passed: boolean
  totalItems: number
  itemsToDelete: number
  percentage: number
  errorMessage?: string
}

/**
 * Performs mass deletion safety check for tag-based deletion.
 * Renamed from performSafetyCheck to clarify its purpose.
 *
 * @param existingSeries - All series from Sonarr
 * @param existingMovies - All movies from Radarr
 * @param taggedSeriesCount - Count of series with removal tag
 * @param taggedMoviesCount - Count of movies with removal tag
 * @param config - Configuration for deletion settings
 * @param logger - Logger instance
 * @returns Safety check result with pass/fail and details
 */
export function performTagBasedSafetyCheck(
  existingSeries: SonarrItem[],
  existingMovies: RadarrItem[],
  taggedSeriesCount: number,
  taggedMoviesCount: number,
  config: SafetyCheckConfig,
  logger: FastifyBaseLogger,
): SafetyCheckResult {
  // Calculate eligible series count based on config
  const eligibleSeriesCount = existingSeries.reduce(
    (acc, s) =>
      acc +
      (s.series_status !== 'ended'
        ? config.deleteContinuingShow
          ? 1
          : 0
        : config.deleteEndedShow
          ? 1
          : 0),
    0,
  )

  const totalItems =
    (config.deleteMovie ? existingMovies.length : 0) + eligibleSeriesCount
  // Defensive check: ensure tagged counts respect config flags
  // Note: The count functions already filter by config, but this provides
  // additional safety in case those functions are modified in the future
  const totalTaggedItems =
    (config.deleteMovie ? taggedMoviesCount : 0) + taggedSeriesCount

  // Check if there's any content
  if (totalItems === 0) {
    logger.warn('No content found in media servers')
    return {
      passed: false,
      totalItems: 0,
      itemsToDelete: 0,
      percentage: 0,
      errorMessage: 'No content found in media servers',
    }
  }

  const taggedPercentage = (totalTaggedItems / totalItems) * 100

  logger.info(
    `Tag-based deletion would affect ${totalTaggedItems} items out of ${totalItems} (${taggedPercentage.toFixed(2)}%)`,
  )

  // Validate maxDeletionPrevention value
  const MAX_DELETION_PERCENTAGE = Number(config.maxDeletionPrevention ?? 10)
  if (
    Number.isNaN(MAX_DELETION_PERCENTAGE) ||
    MAX_DELETION_PERCENTAGE < 0 ||
    MAX_DELETION_PERCENTAGE > 100
  ) {
    return {
      passed: false,
      totalItems,
      itemsToDelete: totalTaggedItems,
      percentage: taggedPercentage,
      errorMessage: `Invalid maxDeletionPrevention value: "${config.maxDeletionPrevention}". Please set a percentage between 0 and 100 inclusive.`,
    }
  }

  // Check if percentage exceeds threshold
  if (taggedPercentage > MAX_DELETION_PERCENTAGE) {
    return {
      passed: false,
      totalItems,
      itemsToDelete: totalTaggedItems,
      percentage: taggedPercentage,
      errorMessage: `Safety check failed: Would delete ${totalTaggedItems} out of ${totalItems} items (${taggedPercentage.toFixed(2)}%), which exceeds maximum allowed percentage of ${MAX_DELETION_PERCENTAGE}%.`,
    }
  }

  // Safety check passed
  return {
    passed: true,
    totalItems,
    itemsToDelete: totalTaggedItems,
    percentage: taggedPercentage,
  }
}

/**
 * Count potential deletions for watchlist-based safety check.
 * Returns counts of movies, shows, and total items considered.
 */
export function countPotentialDeletions(
  existingSeries: SonarrItem[],
  existingMovies: RadarrItem[],
  watchlistGuids: Set<string>,
  protectedGuids: Set<string> | null,
  config: SafetyCheckConfig,
  trackedGuids: Set<string> | null,
  deleteSyncTrackedOnly: boolean,
): { movies: number; shows: number; totalConsidered: number } {
  let potentialMovieDeletes = 0
  let potentialShowDeletes = 0
  let totalConsideredItems = 0

  const considerMovies = config.deleteMovie === true
  const considerEnded = config.deleteEndedShow === true
  const considerContinuing = config.deleteContinuingShow === true

  // Helper to check if any GUID in list is tracked
  const isAnyGuidTracked = (guidList: string[]): boolean => {
    if (!deleteSyncTrackedOnly) {
      return true // All content is considered "tracked" when feature is disabled
    }
    if (trackedGuids === null) {
      return false // No tracked items when cache is null
    }
    return guidList.some((guid) => trackedGuids.has(guid))
  }

  // Count movies not in watchlist and not protected (only if we actually delete movies)
  if (considerMovies) {
    for (const movie of existingMovies) {
      totalConsideredItems++
      const movieGuidList = parseGuids(movie.guids)
      const existsInWatchlist = movieGuidList.some((g: string) =>
        watchlistGuids.has(g),
      )
      if (!existsInWatchlist) {
        // Check if movie is tracked (if tracked-only deletion is enabled)
        const isTracked = isAnyGuidTracked(movieGuidList)
        if (!isTracked) {
          continue // Skip non-tracked items when tracked-only is enabled
        }

        // Check if movie is protected by playlist
        const isProtected =
          protectedGuids != null
            ? movieGuidList.some((g: string) => protectedGuids.has(g))
            : false
        if (!isProtected) {
          potentialMovieDeletes++
        }
      }
    }
  }

  // Count shows not in watchlist and not protected, but only for show types configured for deletion
  for (const show of existingSeries) {
    const isContinuing = show.series_status !== 'ended'
    const shouldConsider = isContinuing ? considerContinuing : considerEnded
    if (!shouldConsider) continue
    totalConsideredItems++

    const showGuidList = parseGuids(show.guids)
    const existsInWatchlist = showGuidList.some((g: string) =>
      watchlistGuids.has(g),
    )
    if (!existsInWatchlist) {
      // Check if show is tracked (if tracked-only deletion is enabled)
      const isTracked = isAnyGuidTracked(showGuidList)
      if (!isTracked) {
        continue // Skip non-tracked items when tracked-only is enabled
      }

      // Check if show is protected by playlist
      const isProtected =
        protectedGuids != null
          ? showGuidList.some((g: string) => protectedGuids.has(g))
          : false
      if (!isProtected) {
        potentialShowDeletes++
      }
    }
  }

  return {
    movies: potentialMovieDeletes,
    shows: potentialShowDeletes,
    totalConsidered: totalConsideredItems,
  }
}

/**
 * Performs safety check to prevent mass deletion for watchlist-based deletion.
 *
 * @param existingSeries - All series from Sonarr
 * @param existingMovies - All movies from Radarr
 * @param allWatchlistItems - Set of all watchlist GUIDs
 * @param protectedGuids - Optional set of protected GUIDs from playlists
 * @param config - Configuration for deletion settings
 * @param trackedGuids - Set of tracked GUIDs (null if cache not loaded)
 * @param deleteSyncTrackedOnly - Whether only tracked content should be deleted
 * @param logger - Logger instance
 * @returns Object with safe boolean and message string
 */
export function performWatchlistSafetyCheck(
  existingSeries: SonarrItem[],
  existingMovies: RadarrItem[],
  allWatchlistItems: Set<string>,
  protectedGuids: Set<string> | null,
  config: SafetyCheckConfig,
  trackedGuids: Set<string> | null,
  deleteSyncTrackedOnly: boolean,
  logger: FastifyBaseLogger,
): { safe: boolean; message: string } {
  // Count potential deletions
  const deletionCounts = countPotentialDeletions(
    existingSeries,
    existingMovies,
    allWatchlistItems,
    protectedGuids,
    config,
    trackedGuids,
    deleteSyncTrackedOnly,
  )

  const totalPotentialDeletes = deletionCounts.movies + deletionCounts.shows
  const potentialDeletionPercentage =
    deletionCounts.totalConsidered > 0
      ? (totalPotentialDeletes / deletionCounts.totalConsidered) * 100
      : 0

  // Prevent mass deletion if percentage is too high
  const MAX_DELETION_PERCENTAGE = Number(config.maxDeletionPrevention ?? 10) // Default to 10% as configured in the database

  if (
    Number.isNaN(MAX_DELETION_PERCENTAGE) ||
    MAX_DELETION_PERCENTAGE < 0 ||
    MAX_DELETION_PERCENTAGE > 100
  ) {
    // Debug breadcrumbs for config validation failures
    logger.debug({
      rawMaxDeletionPrevention: config.maxDeletionPrevention,
      parsed: MAX_DELETION_PERCENTAGE,
      type: typeof config.maxDeletionPrevention,
    })
    return {
      safe: false,
      message: `Invalid maxDeletionPrevention value: "${config.maxDeletionPrevention}". Please set a percentage between 0 and 100 inclusive.`,
    }
  }

  if (potentialDeletionPercentage > MAX_DELETION_PERCENTAGE) {
    return {
      safe: false,
      message: `Safety check failed: Would delete ${totalPotentialDeletes} out of ${deletionCounts.totalConsidered} eligible items (${potentialDeletionPercentage.toFixed(2)}%), which exceeds maximum allowed percentage of ${MAX_DELETION_PERCENTAGE}%.`,
    }
  }

  return { safe: true, message: 'Safety check passed' }
}
