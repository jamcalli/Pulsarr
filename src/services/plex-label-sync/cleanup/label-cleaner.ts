/**
 * Label Cleanup Functions
 *
 * Handles cleanup of labels for deleted watchlist items and orphaned labels
 * that are no longer associated with valid users.
 */

import type {
  RadarrMovieWithTags,
  SonarrSeriesWithTags,
} from '@root/types/plex-label-sync.types.js'
import type { PlexLabelSyncConfig } from '@schemas/plex/label-sync-config.schema.js'
import type { PlexLabelTracking } from '@services/database/methods/plex-label-tracking.js'
import type { DatabaseService } from '@services/database.service.js'
import type { PlexServerService } from '@services/plex-server.service.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
import type { SonarrManagerService } from '@services/sonarr-manager.service.js'
import { parseGuids } from '@utils/guid-handler.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import pLimit from 'p-limit'

import { getRemovedLabel, isAppUserLabel } from '../label-operations/index.js'

/**
 * Dependencies required for label cleanup operations
 */
export interface LabelCleanerDeps {
  plexServer: PlexServerService
  db: DatabaseService
  logger: FastifyBaseLogger
  config: PlexLabelSyncConfig
  radarrManager: RadarrManagerService
  sonarrManager: SonarrManagerService
  fastify: FastifyInstance
  labelPrefix: string
  removedLabelPrefix: string
  removedLabelMode: 'remove' | 'keep' | 'special-label'
  tagPrefix: string
  removedTagPrefix: string
}

/**
 * Removes labels associated with watchlist items that are being deleted
 *
 * This function handles cleanup of Plex labels when watchlist items are removed.
 * It uses the provided watchlist item data to clean up tracking records and
 * remove corresponding labels from Plex content.
 *
 * @param watchlistItems - Array of watchlist items that are being deleted with full data
 * @param deps - Service dependencies
 */
export async function cleanupLabelsForWatchlistItems(
  watchlistItems: Array<{
    id: number
    title?: string
    key: string
    user_id: number
    guids: string[]
    contentType: 'movie' | 'show'
  }>,
  deps: LabelCleanerDeps,
): Promise<void> {
  if (!deps.config.enabled || watchlistItems.length === 0) {
    return
  }

  // Check the removed label mode configuration
  if (deps.removedLabelMode === 'keep') {
    deps.logger.debug(
      {
        itemCount: watchlistItems.length,
      },
      'Label removal mode is set to "keep", preserving both labels and tracking records for deleted watchlist items',
    )
    // In "keep" mode, preserve both labels in Plex AND tracking records in database
    // This maintains the tracking table as the source of truth and enables orphaned cleanup
    return
  }

  if (deps.removedLabelMode === 'special-label') {
    deps.logger.debug(
      {
        itemCount: watchlistItems.length,
      },
      'Label removal mode is set to "special-label", applying special removed labels instead of removing labels for deleted watchlist items',
    )
    // Create user name mapping for efficiency
    const allUsers = await deps.db.getAllUsers()
    const userNameMap = new Map(allUsers.map((user) => [user.id, user.name]))
    await handleSpecialLabelModeForDeletedItems(
      watchlistItems,
      userNameMap,
      deps,
    )
    return
  }

  const cleanupStartTime = Date.now()
  deps.logger.debug(
    {
      itemCount: watchlistItems.length,
      items: watchlistItems.map((item) => ({
        id: item.id,
        title: item.title || 'Unknown',
      })),
    },
    'Starting label cleanup for deleted watchlist items',
  )

  try {
    // Convert raw item keys to primary GUIDs for tracking lookups
    const itemGuidMap = new Map<number, string>() // Map item.id -> primaryGuid

    // Get all tracked labels for these watchlist items
    const trackedLabels = []
    for (const item of watchlistItems) {
      // Get the full watchlist item to access the guids
      const fullItem = await deps.db.getWatchlistItemById(item.id)
      if (!fullItem || !fullItem.guids) {
        deps.logger.debug(
          {
            itemId: item.id,
            title: item.title,
            hasFullItem: !!fullItem,
            hasGuids: !!fullItem?.guids,
          },
          'Skipping item - no full item or guids found',
        )
        continue
      }

      // Parse GUIDs to get the primary GUID (same logic as label application)
      const parsedGuids = parseGuids(fullItem.guids)
      if (parsedGuids.length === 0) {
        deps.logger.debug(
          {
            itemId: item.id,
            title: item.title,
            rawGuids: fullItem.guids,
          },
          'Skipping item - no parsed GUIDs available',
        )
        continue
      }

      const sortedGuids = [...parsedGuids].sort()
      const contentKey = `${fullItem.type}-${JSON.stringify(sortedGuids)}`
      itemGuidMap.set(item.id, contentKey) // Store mapping for later cleanup

      deps.logger.debug(
        `Getting tracked labels for content key: ${contentKey} (was looking for raw key: ${item.key}), user_id: ${item.user_id}`,
      )

      const labels = await deps.db.getTrackedLabelsForContent(
        parsedGuids,
        fullItem.type as 'movie' | 'show',
      )
      deps.logger.debug(
        {
          allTrackingRecords: labels.map((l) => ({
            id: l.id,
            user_id: l.user_id,
            plex_rating_key: l.plex_rating_key,
            labels_applied: l.labels_applied,
          })),
          contentKey,
        },
        `Found ${labels.length} total tracking records for content key: ${contentKey}`,
      )

      // Filter to only this user's labels
      const userLabels = labels.filter(
        (label) => label.user_id === item.user_id,
      )
      deps.logger.debug(
        {
          userTrackingRecords: userLabels.map((l) => ({
            id: l.id,
            plex_rating_key: l.plex_rating_key,
            labels_applied: l.labels_applied,
          })),
          contentKey,
          userId: item.user_id,
        },
        `Found ${userLabels.length} user-specific tracking records for content key: ${contentKey}, user_id: ${item.user_id}`,
      )
      trackedLabels.push(...userLabels)
    }

    deps.logger.debug(
      {
        trackedLabels: trackedLabels.map((t) => ({
          id: t.id,
          content_guids: t.content_guids,
          user_id: t.user_id,
          plex_rating_key: t.plex_rating_key,
          labels_applied: t.labels_applied,
        })),
      },
      `Found ${trackedLabels.length} tracked labels to remove`,
    )

    if (trackedLabels.length === 0) {
      deps.logger.debug(
        'No tracked labels found for cleanup, skipping Plex API calls',
      )
      // Still need to cleanup tracking records using full GUID arrays
      for (const item of watchlistItems) {
        await deps.db.cleanupUserContentTracking(
          item.guids,
          item.contentType,
          item.user_id,
        )
      }
      return
    }

    // Group by rating key to batch operations
    const labelsByRatingKey = new Map<string, string[]>()
    for (const tracking of trackedLabels) {
      const existingLabels =
        labelsByRatingKey.get(tracking.plex_rating_key) || []
      // Add all labels from this tracking record
      existingLabels.push(...tracking.labels_applied)
      labelsByRatingKey.set(tracking.plex_rating_key, existingLabels)
    }

    deps.logger.debug(
      {
        ratingKeys: Array.from(labelsByRatingKey.keys()),
        labelsByRatingKey: Array.from(labelsByRatingKey.entries()).map(
          ([ratingKey, labels]) => ({
            ratingKey,
            labelCount: labels.length,
            labels,
          }),
        ),
      },
      'Grouped labels by rating key for batch removal',
    )

    // Remove labels from Plex content
    const concurrencyLimit = deps.config.concurrencyLimit || 5
    const limit = pLimit(concurrencyLimit)
    let removedCount = 0

    const labelRemovalResults = await Promise.allSettled(
      Array.from(labelsByRatingKey.entries()).map(([ratingKey, labels]) =>
        limit(async () => {
          try {
            const success = await deps.plexServer.removeSpecificLabels(
              ratingKey,
              labels,
            )
            if (success) {
              deps.logger.debug(
                {
                  ratingKey,
                  labels,
                },
                `Removed ${labels.length} labels from Plex content`,
              )
              return labels.length
            }
            deps.logger.warn(
              {
                ratingKey,
                labels,
              },
              `Failed to remove labels from Plex content ${ratingKey}`,
            )
            return 0
          } catch (error) {
            deps.logger.warn(
              {
                error,
                ratingKey,
              },
              `Failed to remove labels from Plex content ${ratingKey}`,
            )
            return 0
          }
        }),
      ),
    )

    // Aggregate successful removals
    for (const result of labelRemovalResults) {
      if (result.status === 'fulfilled') {
        removedCount += result.value
      }
    }

    // Clean up tracking records from database using full GUID arrays
    for (const item of watchlistItems) {
      await deps.db.cleanupUserContentTracking(
        item.guids,
        item.contentType,
        item.user_id,
      )
    }

    const cleanupDuration = Date.now() - cleanupStartTime
    const successRate =
      trackedLabels.length > 0
        ? (removedCount / trackedLabels.length) * 100
        : 100

    deps.logger.info(
      {
        trackedLabelsRemoved: trackedLabels.length,
        plexLabelsRemoved: removedCount,
        duration: `${cleanupDuration}ms`,
        successRate: `${successRate.toFixed(1)}%`,
        averageTimePerItem: `${(cleanupDuration / watchlistItems.length).toFixed(1)}ms`,
      },
      `Completed label cleanup for ${watchlistItems.length} deleted watchlist items`,
    )
  } catch (error) {
    deps.logger.error(
      { error },
      'Error during label cleanup for watchlist items:',
    )
    // Don't throw - label cleanup failure shouldn't prevent item deletion
  }
}

/**
 * Handles special label mode for deleted watchlist items by replacing user labels with special "removed" labels
 *
 * @param watchlistItems - Array of watchlist items that are being deleted
 * @param userNameMap - Map of user IDs to user names
 * @param deps - Service dependencies
 */
async function handleSpecialLabelModeForDeletedItems(
  watchlistItems: Array<{
    id: number
    title?: string
    key: string
    user_id: number
  }>,
  userNameMap: Map<number, string>,
  deps: LabelCleanerDeps,
): Promise<void> {
  deps.logger.debug(
    {
      itemCount: watchlistItems.length,
      items: watchlistItems.map((item) => ({
        id: item.id,
        title: item.title,
        user_id: item.user_id,
        key: item.key,
      })),
    },
    'handleSpecialLabelModeForDeletedItems called with',
  )

  const specialLabelStartTime = Date.now()
  const itemGuidMap = new Map<number, string>() // Map item.id -> primaryGuid
  const itemDataMap = new Map<
    number,
    { guids: string[]; contentType: 'movie' | 'show' }
  >() // Map item.id -> full data

  try {
    // Get all tracked labels for these watchlist items
    const trackedLabels: PlexLabelTracking[] = []

    for (const item of watchlistItems) {
      // Get the full watchlist item to access the guids
      const fullItem = await deps.db.getWatchlistItemById(item.id)
      if (!fullItem || !fullItem.guids) {
        deps.logger.debug(
          {
            itemId: item.id,
            title: item.title,
          },
          'Skipping special label item - no full item or guids found',
        )
        continue
      }

      // Parse GUIDs to get the primary GUID
      const parsedGuids = parseGuids(fullItem.guids)
      if (parsedGuids.length === 0) {
        deps.logger.debug(
          {
            itemId: item.id,
            title: item.title,
          },
          'Skipping special label item - no parsed GUIDs available',
        )
        continue
      }

      const sortedGuids = [...parsedGuids].sort()
      const contentKey = `${fullItem.type}-${JSON.stringify(sortedGuids)}`
      itemGuidMap.set(item.id, contentKey)
      itemDataMap.set(item.id, {
        guids: parsedGuids,
        contentType: fullItem.type === 'show' ? 'show' : 'movie',
      })

      const labels = await deps.db.getTrackedLabelsForContent(
        parsedGuids,
        fullItem.type === 'show' ? 'show' : 'movie',
      )
      // Get all labels for this content (needed to check if other users still have it)
      trackedLabels.push(...labels)
    }

    if (trackedLabels.length === 0) {
      // Clean up tracking records and return
      for (const item of watchlistItems) {
        const itemData = itemDataMap.get(item.id)
        if (itemData) {
          await deps.db.cleanupUserContentTracking(
            itemData.guids,
            itemData.contentType,
            item.user_id,
          )
        }
      }
      return
    }

    // Group by rating key to batch operations
    const labelsByRatingKey = new Map<string, string[]>()
    for (const tracking of trackedLabels) {
      const existingLabels =
        labelsByRatingKey.get(tracking.plex_rating_key) || []
      existingLabels.push(...tracking.labels_applied)
      labelsByRatingKey.set(tracking.plex_rating_key, existingLabels)
    }

    const concurrencyLimit = deps.config.concurrencyLimit || 5
    const limit = pLimit(concurrencyLimit)
    let processedCount = 0

    // For each rating key, replace user labels with special removed label
    const specialLabelResults = await Promise.allSettled(
      Array.from(labelsByRatingKey.entries()).map(([ratingKey, labels]) =>
        limit(async () => {
          try {
            // Get current labels on the content
            const currentLabels =
              await deps.plexServer.getCurrentLabels(ratingKey)

            // Get all users who currently have labels for this content
            const allUsersWithLabels = new Set<number>()
            const removingUserIds = new Set<number>()

            // Collect all user IDs that have labels for this rating key
            for (const tracking of trackedLabels) {
              if (
                tracking.plex_rating_key === ratingKey &&
                tracking.user_id !== null
              ) {
                allUsersWithLabels.add(tracking.user_id)
              }
            }

            // Collect user IDs that are removing content
            for (const item of watchlistItems) {
              removingUserIds.add(item.user_id)
            }

            // Calculate remaining users after removal
            const remainingUserIds = new Set<number>()
            for (const userId of allUsersWithLabels) {
              if (!removingUserIds.has(userId)) {
                remainingUserIds.add(userId)
              }
            }

            // Only remove labels for users who are actually removing content
            // Compute the exact user labels that should be removed
            const userLabelsToRemove: string[] = []
            for (const userId of removingUserIds) {
              const userName = userNameMap.get(userId)
              if (userName) {
                const userLabel = `${deps.config.labelPrefix}:${userName}`
                if (
                  labels.some(
                    (l) => l.toLowerCase() === userLabel.toLowerCase(),
                  )
                ) {
                  userLabelsToRemove.push(userLabel)
                }
              }
            }

            const nonUserLabels = currentLabels.filter(
              (label: string) =>
                !isAppUserLabel(label, deps.config.labelPrefix),
            )

            if (userLabelsToRemove.length > 0) {
              // Only apply removal label if NO users will remain with this content
              const shouldApplyRemovalLabel = remainingUserIds.size === 0

              deps.logger.debug(
                {
                  ratingKey,
                  currentLabels,
                  allUsersWithLabels: allUsersWithLabels.size,
                  removingUserIds: Array.from(removingUserIds),
                  remainingUserIds: Array.from(remainingUserIds),
                  userLabelsToRemove,
                  shouldApplyRemovalLabel,
                },
                'Processing special label removal',
              )

              if (shouldApplyRemovalLabel) {
                const removedLabel = getRemovedLabel(deps.removedLabelPrefix)
                const finalLabels = [
                  ...new Set([...nonUserLabels, removedLabel]),
                ]

                // Apply the new label set
                const success = await deps.plexServer.updateLabels(
                  ratingKey,
                  finalLabels,
                )
                if (success) {
                  deps.logger.debug(
                    {
                      removedLabel,
                      userLabelsRemoved: userLabelsToRemove.length,
                      ratingKey,
                    },
                    `Applied special removed label to content ${ratingKey}`,
                  )

                  // Create tracking record for the removed label
                  try {
                    // Find tracking record for this rating key to get content info
                    const trackingRecord = trackedLabels.find(
                      (t) => t.plex_rating_key === ratingKey,
                    )

                    if (trackingRecord) {
                      await deps.db.trackPlexLabels(
                        trackingRecord.content_guids,
                        trackingRecord.content_type,
                        null, // System operation for removed labels
                        ratingKey,
                        [removedLabel],
                      )
                      deps.logger.debug(
                        {
                          ratingKey,
                          removedLabel,
                          guids: trackingRecord.content_guids,
                          contentType: trackingRecord.content_type,
                        },
                        'Successfully tracked removed label',
                      )
                    } else {
                      deps.logger.warn(
                        {
                          ratingKey,
                          removedLabel,
                        },
                        'No tracking record found for rating key during removal tracking',
                      )
                    }
                  } catch (trackError) {
                    deps.logger.error(
                      {
                        error: trackError,
                        ratingKey,
                        removedLabel,
                      },
                      'Failed to track removed label',
                    )
                  }
                  return 1
                }
              } else {
                // Other users still have this content, just remove specific user labels
                const removedPrefix = deps.removedLabelPrefix.toLowerCase()
                const remainingLabels = currentLabels.filter((label) => {
                  const ll = label.toLowerCase()
                  const isUserLabelRemoved = userLabelsToRemove.some(
                    (removeLabel) => removeLabel.toLowerCase() === ll,
                  )
                  const isRemovedMarker = ll.startsWith(removedPrefix)
                  return !isUserLabelRemoved && !isRemovedMarker
                })

                deps.logger.debug(
                  {
                    ratingKey,
                    currentLabels,
                    userLabelsToRemove,
                    remainingLabels,
                  },
                  'About to update labels',
                )

                const success = await deps.plexServer.updateLabels(
                  ratingKey,
                  remainingLabels,
                )

                if (success) {
                  deps.logger.debug(
                    {
                      ratingKey,
                      userLabelsRemoved: userLabelsToRemove.length,
                      remainingUsersCount: remainingUserIds.size,
                      totalLabelsRemaining: remainingLabels.length,
                    },
                    'Removed specific user labels while preserving others',
                  )
                  return 1
                }
              }
            }
            return 0
          } catch (error) {
            deps.logger.warn(
              {
                error,
                ratingKey,
              },
              `Failed to apply special removed label to content ${ratingKey}`,
            )
            return 0
          }
        }),
      ),
    )

    // Count successful operations
    for (const result of specialLabelResults) {
      if (result.status === 'fulfilled') {
        processedCount += result.value
      }
    }

    // Clean up tracking records from database using primary GUIDs
    for (const item of watchlistItems) {
      const itemData = itemDataMap.get(item.id)
      if (itemData) {
        await deps.db.cleanupUserContentTracking(
          itemData.guids,
          itemData.contentType,
          item.user_id,
        )
      }
    }

    const specialLabelDuration = Date.now() - specialLabelStartTime

    deps.logger.info(
      {
        trackedLabelsFound: trackedLabels.length,
        contentItemsProcessed: processedCount,
        duration: `${specialLabelDuration}ms`,
        averageTimePerItem: `${(specialLabelDuration / watchlistItems.length).toFixed(1)}ms`,
      },
      `Completed special label handling for ${watchlistItems.length} deleted watchlist items`,
    )
  } catch (error) {
    deps.logger.error(
      {
        error,
      },
      'Error during special label handling for deleted watchlist items',
    )
    // Still clean up tracking records on error using primary GUIDs
    for (const item of watchlistItems) {
      try {
        // Try to use the already mapped primary GUID first
        const itemData = itemDataMap.get(item.id)
        if (itemData) {
          await deps.db.cleanupUserContentTracking(
            itemData.guids,
            itemData.contentType,
            item.user_id,
          )
        } else {
          // Fallback: fetch item and parse GUID if not already mapped
          const fullItem = await deps.db.getWatchlistItemById(item.id)
          if (fullItem?.guids) {
            const parsedGuids = parseGuids(fullItem.guids)
            if (parsedGuids.length > 0) {
              await deps.db.cleanupUserContentTracking(
                parsedGuids,
                fullItem.type === 'show' ? 'show' : 'movie',
                item.user_id,
              )
            }
          }
        }
      } catch (cleanupError) {
        deps.logger.warn(
          {
            error: cleanupError,
            itemId: item.id,
          },
          `Failed to cleanup tracking for item ${item.id}`,
        )
      }
    }
  }
}

/**
 * Cleanup orphaned Plex labels - removes only truly orphaned labels based on current state
 *
 * Proper orphaned cleanup that:
 * 1. Gets all sync-enabled users who should have labels
 * 2. Builds the set of valid labels that should exist
 * 3. Uses tracking table to find labels that exist but are no longer valid
 * 4. Removes only the orphaned labels, preserving legitimate labels
 *
 * @param radarrMoviesWithTags - Optional pre-fetched Radarr movies with tags
 * @param sonarrSeriesWithTags - Optional pre-fetched Sonarr series with tags
 * @param deps - Service dependencies
 * @returns Promise resolving to cleanup results
 */
export async function cleanupOrphanedPlexLabels(
  radarrMoviesWithTags: RadarrMovieWithTags[] | undefined,
  sonarrSeriesWithTags: SonarrSeriesWithTags[] | undefined,
  deps: LabelCleanerDeps,
): Promise<{
  removed: number
  failed: number
}> {
  if (!deps.config.enabled || !deps.config.cleanupOrphanedLabels) {
    deps.logger.debug(
      'Plex label sync or orphaned cleanup disabled, skipping orphaned label cleanup',
    )
    return { removed: 0, failed: 0 }
  }

  const result = { removed: 0, failed: 0 }

  try {
    deps.logger.info('Starting orphaned Plex label cleanup')

    // Step 1: Get all users with sync enabled
    const allUsers = await deps.db.getAllUsers()
    const syncEnabledUsers = allUsers.filter((user) => user.can_sync)

    if (syncEnabledUsers.length === 0) {
      deps.logger.info('No sync-enabled users found, skipping orphaned cleanup')
      return { removed: 0, failed: 0 }
    }

    deps.logger.debug(
      `Found ${syncEnabledUsers.length} sync-enabled users out of ${allUsers.length} total users`,
    )

    // Step 2: Build set of valid labels that should exist
    const validLabels = new Set<string>()

    // Add user labels for sync-enabled users
    for (const user of syncEnabledUsers) {
      const userLabel = `${deps.config.labelPrefix}:${user.name}`
      validLabels.add(userLabel.toLowerCase())
    }

    // Add tag labels if tag sync is enabled
    if (deps.config.tagSync.enabled) {
      try {
        if (radarrMoviesWithTags && sonarrSeriesWithTags) {
          // Use pre-fetched tag data when available (called from sync)
          deps.logger.debug('Using pre-fetched tag data for cleanup validation')

          // Extract unique tags from Radarr movies
          const radarrTags = new Set<string>()
          for (const movieWithTags of radarrMoviesWithTags) {
            for (const tag of movieWithTags.tags) {
              radarrTags.add(tag)
            }
          }

          // Extract unique tags from Sonarr series
          const sonarrTags = new Set<string>()
          for (const seriesWithTags of sonarrSeriesWithTags) {
            for (const tag of seriesWithTags.tags) {
              sonarrTags.add(tag)
            }
          }

          // Add all unique tags as valid labels
          for (const tag of radarrTags) {
            const tagLabel = `${deps.config.labelPrefix}:${tag}`
            validLabels.add(tagLabel.toLowerCase())
          }
          for (const tag of sonarrTags) {
            const tagLabel = `${deps.config.labelPrefix}:${tag}`
            validLabels.add(tagLabel.toLowerCase())
          }
        } else {
          // Fetch fresh tag data when called independently
          deps.logger.debug('Fetching fresh tag data for cleanup validation')

          // Get tags from Radarr instances
          const radarrInstances = await deps.radarrManager.getAllInstances()
          for (const instance of radarrInstances) {
            try {
              const radarrService = deps.radarrManager.getRadarrService(
                instance.id,
              )
              if (!radarrService) {
                deps.logger.warn(
                  `Could not get Radarr service for instance ${instance.id}`,
                )
                continue
              }

              const tags = await radarrService.getTags()
              for (const tag of tags) {
                const tagLabel = `${deps.config.labelPrefix}:${tag.label}`
                validLabels.add(tagLabel.toLowerCase())
              }
            } catch (error) {
              deps.logger.warn(
                {
                  error,
                  instanceName: instance.name,
                },
                `Failed to get tags from Radarr instance ${instance.name}`,
              )
            }
          }

          // Get tags from Sonarr instances
          const sonarrInstances = await deps.sonarrManager.getAllInstances()
          for (const instance of sonarrInstances) {
            try {
              const sonarrService = deps.sonarrManager.getSonarrService(
                instance.id,
              )
              if (!sonarrService) {
                deps.logger.warn(
                  `Could not get Sonarr service for instance ${instance.id}`,
                )
                continue
              }

              const tags = await sonarrService.getTags()
              for (const tag of tags) {
                const tagLabel = `${deps.config.labelPrefix}:${tag.label}`
                validLabels.add(tagLabel.toLowerCase())
              }
            } catch (error) {
              deps.logger.warn(
                {
                  error,
                  instanceName: instance.name,
                },
                `Failed to get tags from Sonarr instance ${instance.name}`,
              )
            }
          }
        }
      } catch (error) {
        deps.logger.warn(
          {
            error,
          },
          'Error getting tags for orphaned cleanup',
        )
      }
    }

    deps.logger.debug(
      {
        validLabelsCount: validLabels.size,
        tagSyncEnabled: deps.config.tagSync.enabled,
      },
      `Built ${validLabels.size} valid labels for orphaned cleanup`,
    )

    // Step 3: Use tracking table to find orphaned labels
    const orphanedLabelGroups = await deps.db.getOrphanedLabelTracking(
      validLabels,
      deps.config.labelPrefix,
    )

    if (orphanedLabelGroups.length === 0) {
      deps.logger.info('No orphaned labels found in tracking table')
      return { removed: 0, failed: 0 }
    }

    deps.logger.info(
      {
        affectedItems: orphanedLabelGroups.length,
        totalOrphanedLabels: orphanedLabelGroups.reduce(
          (sum, group) => sum + group.orphaned_labels.length,
          0,
        ),
      },
      `Found orphaned labels on ${orphanedLabelGroups.length} Plex items`,
    )

    // Step 4: Remove orphaned labels from Plex content
    const concurrencyLimit = deps.config.concurrencyLimit || 5
    const limit = pLimit(concurrencyLimit)
    const successfulOrphanedOperations: Array<{
      plexRatingKey: string
      orphanedLabels: string[]
    }> = []

    const cleanupResults = await Promise.allSettled(
      orphanedLabelGroups.map((group) =>
        limit(async () => {
          const { plex_rating_key, orphaned_labels } = group

          try {
            // Get current labels from Plex
            const metadata = await deps.plexServer.getMetadata(plex_rating_key)
            const currentLabels =
              metadata?.Label?.map((label) => label.tag) || []

            if (currentLabels.length === 0) {
              // No labels exist, collect tracking cleanup operation
              successfulOrphanedOperations.push({
                plexRatingKey: plex_rating_key,
                orphanedLabels: orphaned_labels,
              })
              return { removed: 0, failed: 0 }
            }

            // Filter out orphaned labels from current labels
            const filteredLabels = currentLabels.filter(
              (label) => !orphaned_labels.includes(label),
            )

            // Only update if we're actually removing labels
            if (filteredLabels.length < currentLabels.length) {
              const success = await deps.plexServer.updateLabels(
                plex_rating_key,
                filteredLabels,
              )

              if (success) {
                // Collect successful operations for bulk cleanup
                successfulOrphanedOperations.push({
                  plexRatingKey: plex_rating_key,
                  orphanedLabels: orphaned_labels,
                })

                const removedCount =
                  currentLabels.length - filteredLabels.length
                deps.logger.debug(
                  {
                    ratingKey: plex_rating_key,
                    title: metadata?.title || 'Unknown',
                    removedLabels: orphaned_labels,
                    remainingLabels: filteredLabels,
                    removedCount,
                  },
                  `Removed ${removedCount} orphaned labels from content`,
                )

                return { removed: removedCount, failed: 0 }
              }
              deps.logger.error(
                `Failed to update labels for rating key ${plex_rating_key}`,
              )
              return { removed: 0, failed: orphaned_labels.length }
            }
            // Labels were already removed externally, collect tracking cleanup operation
            successfulOrphanedOperations.push({
              plexRatingKey: plex_rating_key,
              orphanedLabels: orphaned_labels,
            })
            return { removed: 0, failed: 0 }
          } catch (error) {
            deps.logger.error(
              {
                error,
                ratingKey: plex_rating_key,
              },
              `Error cleaning up orphaned labels for rating key ${plex_rating_key}`,
            )
            return { removed: 0, failed: orphaned_labels.length }
          }
        }),
      ),
    )

    // Aggregate results
    for (const cleanupResult of cleanupResults) {
      if (cleanupResult.status === 'fulfilled') {
        result.removed += cleanupResult.value.removed
        result.failed += cleanupResult.value.failed
      } else {
        result.failed++
      }
    }

    // Execute bulk orphaned tracking cleanup for successful operations
    if (successfulOrphanedOperations.length > 0) {
      deps.logger.debug(
        `Executing bulk orphaned tracking cleanup for ${successfulOrphanedOperations.length} operations`,
      )
      try {
        const orphanedCleanupResult = await deps.db.removeOrphanedTrackingBulk(
          successfulOrphanedOperations,
        )
        deps.logger.debug(
          {
            successfulCount: orphanedCleanupResult.processedCount,
            failedIds: orphanedCleanupResult.failedIds,
          },
          `Bulk orphaned tracking cleanup completed: ${orphanedCleanupResult.processedCount} successful, ${orphanedCleanupResult.failedIds.length} failed`,
        )
        if (orphanedCleanupResult.failedIds.length > 0) {
          deps.logger.warn(
            `Some orphaned tracking cleanup operations failed for rating keys: ${orphanedCleanupResult.failedIds.join(', ')}`,
          )
        }
      } catch (orphanedCleanupError) {
        deps.logger.warn(
          {
            error: orphanedCleanupError,
          },
          'Bulk orphaned tracking cleanup failed',
        )
      }
    }

    deps.logger.info(
      {
        processedItems: orphanedLabelGroups.length,
        removedLabels: result.removed,
        failedLabels: result.failed,
      },
      'Orphaned Plex label cleanup completed',
    )

    return result
  } catch (error) {
    deps.logger.error({ error }, 'Error during orphaned label cleanup:')
    return { removed: 0, failed: 1 }
  }
}
