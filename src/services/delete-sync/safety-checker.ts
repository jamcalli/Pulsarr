import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
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
 * Performs mass deletion safety check for tag-based deletion
 *
 * @param existingSeries - All series from Sonarr
 * @param existingMovies - All movies from Radarr
 * @param taggedSeriesCount - Count of series with removal tag
 * @param taggedMoviesCount - Count of movies with removal tag
 * @param config - Configuration for deletion settings
 * @param logger - Logger instance
 * @returns Safety check result with pass/fail and details
 */
export function performSafetyCheck(
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
