/**
 * Content Tracking Module
 *
 * Handles updating the tracking table to reflect the final state after label reconciliation.
 * Removes obsolete tracking records and adds new ones as needed with bulk operations.
 */

import type { ContentWithUsers } from '@root/types/plex-label-sync.types.js'
import type { PlexLabelSyncConfig } from '@schemas/plex/label-sync-config.schema.js'
import type {
  TrackPlexLabelsOperation,
  UntrackPlexLabelOperation,
} from '@services/database/methods/plex-label-tracking.js'
import type { DatabaseService } from '@services/database.service.js'
import type { FastifyBaseLogger } from 'fastify'

export interface ContentTrackerDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
  config: PlexLabelSyncConfig
}

/**
 * Updates the tracking table to reflect the final state after label reconciliation.
 * Removes obsolete tracking records and adds new ones as needed.
 * Implements true batching by collecting operations and executing in bulk.
 *
 * @param content - The content being processed
 * @param plexItems - The Plex items for this content
 * @param allFinalLabels - All final labels (user + tag)
 * @param finalUserLabels - The final set of user labels that should be tracked
 * @param finalTagLabels - The final set of tag labels that should be tracked
 * @param appliedRemovedLabels - Map of rating keys to removed labels applied
 * @param deps - Service dependencies
 */
export async function updateTrackingForContent(
  content: ContentWithUsers,
  plexItems: Array<{ ratingKey: string; title: string }>,
  allFinalLabels: string[],
  finalUserLabels: string[],
  finalTagLabels: string[],
  appliedRemovedLabels: Map<string, string>,
  deps: ContentTrackerDeps,
): Promise<void> {
  try {
    deps.logger.debug(
      {
        primaryGuid: content.primaryGuid,
        title: content.title,
        userCount: content.users.length,
        plexItemCount: plexItems.length,
        finalUserLabels,
      },
      'Updating tracking table for content',
    )

    // Collect operations for bulk processing
    const untrackOperations: UntrackPlexLabelOperation[] = []
    const trackOperations: TrackPlexLabelsOperation[] = []

    // Process each Plex item
    for (const plexItem of plexItems) {
      // Get current tracking records for this rating key
      const currentTracking = await deps.db.getTrackedLabelsForRatingKey(
        plexItem.ratingKey,
      )

      // Determine which tracking records should exist
      const desiredTracking = new Set<string>()

      // Track user labels with their specific watchlist IDs
      for (const user of content.users) {
        const userLabel = `${deps.config.labelPrefix}:${user.username}`
        if (finalUserLabels.includes(userLabel)) {
          desiredTracking.add(
            `${user.watchlist_id}:${plexItem.ratingKey}:${userLabel}`,
          )
        }
      }

      // Track tag labels per user to align with per-user tracking records
      if (finalTagLabels.length > 0 && content.users.length > 0) {
        for (const tagLabel of finalTagLabels) {
          if (allFinalLabels.includes(tagLabel)) {
            for (const u of content.users) {
              desiredTracking.add(
                `${u.watchlist_id}:${plexItem.ratingKey}:${tagLabel}`,
              )
            }
          }
        }
      }

      // Track special removed label for this item (system user ID 0)
      const removedLabelForItem = appliedRemovedLabels.get(plexItem.ratingKey)
      if (removedLabelForItem) {
        const systemTrackingKey = `__system__:${plexItem.ratingKey}:${removedLabelForItem}`
        desiredTracking.add(systemTrackingKey)

        deps.logger.debug(
          {
            ratingKey: plexItem.ratingKey,
            removedLabel: removedLabelForItem,
            trackingKey: systemTrackingKey,
          },
          'Added system removed label to desired tracking',
        )
      }

      // Collect obsolete tracking records for bulk removal
      for (const tracking of currentTracking) {
        // Check each label in the tracking record
        for (const label of tracking.labels_applied) {
          let trackingKey: string

          if (tracking.user_id === null) {
            // System tracking record for removed labels
            trackingKey = `__system__:${tracking.plex_rating_key}:${label}`
          } else {
            // Regular user tracking record
            const matchingUser = content.users.find(
              (u) => u.user_id === tracking.user_id,
            )
            // Use a sentinel value that cannot collide with a valid watchlist_id
            const ORPHAN_SENTINEL = `__orphaned_user_${tracking.user_id}__`
            const watchlistId = matchingUser?.watchlist_id ?? ORPHAN_SENTINEL
            trackingKey = `${watchlistId}:${tracking.plex_rating_key}:${label}`
          }

          if (!desiredTracking.has(trackingKey)) {
            untrackOperations.push({
              contentGuids: tracking.content_guids,
              userId: tracking.user_id,
              plexRatingKey: tracking.plex_rating_key,
              labelApplied: label,
            })
            deps.logger.debug(
              {
                contentKey: tracking.content_guids.join(','),
                userId: tracking.user_id,
                ratingKey: tracking.plex_rating_key,
                label: label,
                isSystemRecord: tracking.user_id === null,
              },
              'Queued obsolete tracking record for removal',
            )
          }
        }
      }

      // Collect tracking operations using efficient array-based approach
      for (const user of content.users) {
        const userLabel = `${deps.config.labelPrefix}:${user.username}`

        // Validate user data before processing
        if (!user.watchlist_id || typeof user.watchlist_id !== 'number') {
          deps.logger.warn(
            {
              userId: user.user_id,
              username: user.username,
              watchlistId: user.watchlist_id,
              ratingKey: plexItem.ratingKey,
            },
            'Invalid watchlist_id for user, skipping tracking',
          )
          continue
        }

        // Build complete label array for this user (user label + all tag labels)
        const userLabelsForContent: string[] = []

        // Add user label if it should be applied
        if (finalUserLabels.includes(userLabel)) {
          userLabelsForContent.push(userLabel)
        }

        // Add all tag labels (tags apply to all users with this content)
        userLabelsForContent.push(...finalTagLabels)

        // Only queue tracking if there are labels to track
        if (userLabelsForContent.length > 0) {
          trackOperations.push({
            contentGuids: content.allGuids,
            contentType: content.type as 'movie' | 'show',
            userId: user.user_id,
            plexRatingKey: plexItem.ratingKey,
            labelsApplied: userLabelsForContent,
          })
          deps.logger.debug(
            {
              watchlistId: user.watchlist_id,
              ratingKey: plexItem.ratingKey,
              labelCount: userLabelsForContent.length,
              labels: userLabelsForContent,
            },
            'Queued complete label tracking operation',
          )
        }
      }
    }

    // Add system tracking operations for removed labels
    for (const [ratingKey, removedLabel] of appliedRemovedLabels) {
      trackOperations.push({
        contentGuids: content.allGuids,
        contentType: content.type as 'movie' | 'show',
        userId: null, // System operation for removed labels
        plexRatingKey: ratingKey,
        labelsApplied: [removedLabel],
      })
      deps.logger.debug(
        {
          ratingKey,
          removedLabel,
          contentTitle: content.title,
        },
        'Queued system tracking operation for removed label',
      )
    }

    // Execute bulk operations
    let totalUntracked = 0
    let totalTracked = 0
    let totalFailures = 0

    // Process bulk untracking
    if (untrackOperations.length > 0) {
      deps.logger.debug(
        {
          operationCount: untrackOperations.length,
        },
        'Executing bulk untrack operations',
      )
      try {
        const untrackResult =
          await deps.db.untrackPlexLabelBulk(untrackOperations)
        totalUntracked = untrackResult.processedCount
        if (untrackResult.failedIds.length > 0) {
          totalFailures += untrackResult.failedIds.length
          deps.logger.warn(
            {
              failedCount: untrackResult.failedIds.length,
              failedIds: untrackResult.failedIds,
            },
            'Some untrack operations failed',
          )
        }
      } catch (error) {
        deps.logger.error(
          {
            operationCount: untrackOperations.length,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to execute bulk untrack operations',
        )
        totalFailures += untrackOperations.length
      }
    }

    // Process bulk tracking
    if (trackOperations.length > 0) {
      deps.logger.debug(
        {
          operationCount: trackOperations.length,
        },
        'Executing bulk track operations',
      )
      try {
        const trackResult = await deps.db.trackPlexLabelsBulk(trackOperations)
        totalTracked = trackResult.processedCount
        if (trackResult.failedIds.length > 0) {
          totalFailures += trackResult.failedIds.length
          deps.logger.warn(
            {
              failedCount: trackResult.failedIds.length,
              failedIds: trackResult.failedIds,
            },
            'Some track operations failed',
          )
        }
      } catch (error) {
        deps.logger.error(
          {
            operationCount: trackOperations.length,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to execute bulk track operations',
        )
        totalFailures += trackOperations.length
      }
    }

    deps.logger.debug(
      {
        primaryGuid: content.primaryGuid,
        title: content.title,
        untrackOperations: untrackOperations.length,
        trackOperations: trackOperations.length,
        totalUntracked,
        totalTracked,
        totalFailures,
      },
      'Completed tracking table update for content',
    )
  } catch (error) {
    deps.logger.error(
      {
        primaryGuid: content.primaryGuid,
        title: content.title,
        error,
      },
      'Error updating tracking table for content',
    )
    // Don't throw - tracking failures shouldn't prevent label sync
  }
}
