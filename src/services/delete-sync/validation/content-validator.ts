import type { TagCache, TagService } from '@services/delete-sync/cache/index.js'
import {
  hasRemovalTag,
  hasTagMatchingRegex,
} from '@services/delete-sync/tag-operations/index.js'
import type { FastifyBaseLogger } from 'fastify'

/**
 * Result of content validation for deletion
 */
export interface ValidationResult {
  /** Whether to skip this item (doesn't meet criteria) */
  skip: boolean
  /** Whether this item is protected from deletion */
  protected: boolean
  /** Reason for skip/protection (for logging) */
  reason?: string
  /** Whether this item was skipped due to not being tracked */
  notTracked?: boolean
}

/**
 * Configuration for content validation
 */
export interface ValidationConfig {
  /** Mode of deletion */
  deletionMode: 'watchlist' | 'tag-based'
  /** Removal tag prefix for tag-based deletion */
  removedTagPrefix?: string
  /** Optional regex pattern for additional tag filtering */
  deleteSyncRequiredTagRegex?: string
  /** Only delete tracked content */
  deleteSyncTrackedOnly: boolean
  /** Enable Plex playlist protection */
  enablePlexPlaylistProtection: boolean
  /** Set of GUIDs in watchlists (for watchlist mode) */
  watchlistGuids?: Set<string>
}

/**
 * Validators for content deletion checks
 */
export interface ContentValidators {
  /** Check if any GUID is tracked */
  isAnyGuidTracked: (
    guidList: string[],
    onHit?: (guid: string) => void,
  ) => boolean
  /** Check if any GUID is protected */
  isAnyGuidProtected: (
    guidList: string[],
    onHit?: (guid: string) => void,
  ) => boolean
}

/**
 * Validate content for deletion in tag-based mode
 *
 * @param instanceId - Instance ID
 * @param service - Tag service
 * @param itemTags - Tags on the item
 * @param itemGuids - GUIDs of the item
 * @param itemTitle - Title of the item (for logging)
 * @param instanceType - 'sonarr' or 'radarr'
 * @param config - Validation configuration
 * @param validators - Validation functions
 * @param tagCache - Tag cache
 * @param logger - Logger
 * @param protectedGuids - Protected GUIDs set (for error checking)
 * @returns Validation result
 */
export async function validateTagBasedDeletion(
  instanceId: number,
  service: TagService,
  itemTags: number[],
  itemGuids: string[],
  itemTitle: string,
  instanceType: 'sonarr' | 'radarr',
  config: ValidationConfig,
  validators: ContentValidators,
  tagCache: TagCache,
  logger: FastifyBaseLogger,
  _protectedGuids: Set<string> | null,
): Promise<ValidationResult> {
  // Check if the item has the removal tag
  const hasRemoval = await hasRemovalTag(
    instanceId,
    service,
    itemTags,
    instanceType,
    config.removedTagPrefix,
    tagCache,
    logger,
  )

  if (!hasRemoval) {
    return { skip: true, protected: false, reason: 'no-removal-tag' }
  }

  // Check if the item has a tag matching the required regex pattern (if configured)
  const hasRequired = await hasTagMatchingRegex(
    instanceId,
    service,
    itemTags,
    instanceType,
    config.deleteSyncRequiredTagRegex,
    tagCache,
    logger,
  )

  if (!hasRequired) {
    logger.debug(
      `Skipping deletion of "${itemTitle}" as it doesn't have a tag matching the required regex pattern`,
    )
    return { skip: true, protected: false, reason: 'no-required-tag' }
  }

  // Check tracked-only deletion
  if (config.deleteSyncTrackedOnly) {
    const isTracked = validators.isAnyGuidTracked(itemGuids, (guid) =>
      logger.debug(`"${itemTitle}" is tracked by GUID "${guid}"`),
    )

    if (!isTracked) {
      logger.debug(
        `Skipping deletion of "${itemTitle}" as it is not tracked in approval system (tracked-only deletion enabled)`,
      )
      return { skip: true, protected: false, notTracked: true }
    }
  }

  // Check protection
  if (config.enablePlexPlaylistProtection) {
    const isProtected = validators.isAnyGuidProtected(itemGuids, (guid) =>
      logger.debug(`"${itemTitle}" is protected by GUID "${guid}"`),
    )

    if (isProtected) {
      return { skip: false, protected: true }
    }
  }

  // All checks passed
  return { skip: false, protected: false }
}

/**
 * Validate content for deletion in watchlist mode
 *
 * @param itemGuids - GUIDs of the item
 * @param itemTitle - Title of the item (for logging)
 * @param config - Validation configuration
 * @param validators - Validation functions
 * @param logger - Logger
 * @param protectedGuids - Protected GUIDs set (for error checking)
 * @returns Validation result
 */
export function validateWatchlistDeletion(
  itemGuids: string[],
  itemTitle: string,
  config: ValidationConfig,
  validators: ContentValidators,
  logger: FastifyBaseLogger,
  _protectedGuids: Set<string> | null,
): ValidationResult {
  // Check if item is IN watchlist - skip deletion if it is
  if (config.watchlistGuids) {
    const existsInWatchlist = itemGuids.some((guid) =>
      config.watchlistGuids?.has(guid),
    )
    if (existsInWatchlist) {
      return { skip: true, protected: false, reason: 'in-watchlist' }
    }
  }

  // Check tracked-only deletion
  if (config.deleteSyncTrackedOnly) {
    const isTracked = validators.isAnyGuidTracked(itemGuids, (guid) =>
      logger.debug(`"${itemTitle}" is tracked by GUID "${guid}"`),
    )

    if (!isTracked) {
      logger.debug(
        `Skipping deletion of "${itemTitle}" as it is not tracked in approval system (tracked-only deletion enabled)`,
      )
      return { skip: true, protected: false, notTracked: true }
    }
  }

  // Check protection
  if (config.enablePlexPlaylistProtection) {
    const isProtected = validators.isAnyGuidProtected(itemGuids, (guid) =>
      logger.debug(`"${itemTitle}" is protected by GUID "${guid}"`),
    )

    if (isProtected) {
      return { skip: false, protected: true }
    }
  }

  // All checks passed
  return { skip: false, protected: false }
}
