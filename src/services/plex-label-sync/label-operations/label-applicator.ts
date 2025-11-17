/**
 * Label Applicator Module
 *
 * Handles applying labels to single Plex items with proper mode handling.
 * Supports webhook tags and integrates with the tracking system.
 */

import type { PlexLabelSyncConfig } from '@schemas/plex/label-sync-config.schema.js'
import type { DatabaseService } from '@services/database.service.js'
import type { PlexServerService } from '@services/plex-server.service.js'
import { parseGuids } from '@utils/guid-handler.js'
import type { FastifyBaseLogger } from 'fastify'
import {
  filterAndFormatTagsAsLabels,
  isAppTagLabel,
  isAppUserLabel,
} from './label-validator.js'

export interface LabelApplicatorDeps {
  plexServer: PlexServerService
  db: DatabaseService
  logger: FastifyBaseLogger
  config: PlexLabelSyncConfig
  removedLabelMode: 'remove' | 'keep' | 'special-label'
  removedLabelPrefix: string
  tagPrefix: string
  removedTagPrefix: string
}

/**
 * Applies labels to a single Plex item based on users and optional webhook tags.
 * Handles different label modes (keep, remove, special-label) and tracks changes.
 *
 * @param ratingKey - The Plex rating key for the item
 * @param users - Array of users who want this content
 * @param deps - Service dependencies
 * @param webhookTags - Optional webhook tags to apply as labels
 * @param contentType - Optional content type (movie or show)
 * @returns Promise resolving to true if successful, false otherwise
 */
export async function applyLabelsToSingleItem(
  ratingKey: string,
  users: Array<{ user_id: number; username: string; watchlist_id: number }>,
  deps: LabelApplicatorDeps,
  webhookTags?: string[],
  contentType?: string,
): Promise<boolean> {
  try {
    // Get current item metadata to preserve existing labels
    let existingLabels: string[] = []
    const metadata = await deps.plexServer.getMetadata(ratingKey)
    if (metadata?.Label) {
      existingLabels = metadata.Label.map((label) => label.tag)
    }

    // Generate user labels based on configured prefix
    const userLabels = users.map(
      (user) => `${deps.config.labelPrefix}:${user.username}`,
    )

    // Process webhook tag labels if available and tag sync is enabled
    let tagLabels: string[] = []
    if (deps.config.tagSync.enabled && webhookTags && webhookTags.length > 0) {
      const isMovie = contentType === 'movie'
      const isShow = contentType === 'show'

      // Check if tag sync is enabled for this content type
      const shouldSyncTags =
        (isMovie && deps.config.tagSync.syncRadarrTags) ||
        (isShow && deps.config.tagSync.syncSonarrTags) ||
        (!isMovie && !isShow) // Default to true if content type unclear

      if (shouldSyncTags) {
        // Filter out tags managed by user tagging system and format as labels
        tagLabels = filterAndFormatTagsAsLabels(
          webhookTags,
          deps.tagPrefix,
          deps.removedTagPrefix,
          deps.config.labelPrefix,
        )

        deps.logger.debug(
          {
            ratingKey,
            contentType,
            originalTags: webhookTags,
            tagLabels,
          },
          'Processed webhook tags for label sync',
        )
      } else {
        deps.logger.debug(
          {
            ratingKey,
            contentType,
            tagSyncEnabled: deps.config.tagSync.enabled,
            syncRadarrTags: deps.config.tagSync.syncRadarrTags,
            syncSonarrTags: deps.config.tagSync.syncSonarrTags,
          },
          'Tag sync disabled for content type, skipping webhook tags',
        )
      }
    }

    // Clean up any existing "removed" labels when users are re-adding content
    const removedLabels = existingLabels.filter((label) =>
      label.toLowerCase().startsWith(deps.removedLabelPrefix.toLowerCase()),
    )

    let cleanedExistingLabels = existingLabels
    if (userLabels.length > 0 && removedLabels.length > 0) {
      // Remove any "removed" labels since we're adding users back
      cleanedExistingLabels = existingLabels.filter(
        (label) => !removedLabels.includes(label),
      )
      deps.logger.debug(
        {
          ratingKey,
          removedLabels,
        },
        'Removing obsolete "removed" labels',
      )
    }

    // Handle labels based on configured cleanup mode
    let finalLabels: string[]

    if (deps.removedLabelMode === 'keep') {
      // Get all tracked labels for this rating key from the tracking table
      const trackedLabels =
        await deps.db.getTrackedLabelsForRatingKey(ratingKey)
      const allTrackedLabels = new Set<string>()

      // Collect all labels from all tracking records
      for (const tracking of trackedLabels) {
        for (const label of tracking.labels_applied) {
          allTrackedLabels.add(label)
        }
      }

      // Combine tracked labels with new user/tag labels
      finalLabels = [
        ...new Set([
          ...Array.from(allTrackedLabels),
          ...userLabels,
          ...tagLabels,
          // Also preserve any non-app labels from Plex
          ...cleanedExistingLabels.filter(
            (label) => !isAppUserLabel(label, deps.config.labelPrefix),
          ),
        ]),
      ]

      deps.logger.debug(
        {
          ratingKey,
          mode: 'keep',
          existingCount: cleanedExistingLabels.length,
          addingUserCount: userLabels.length,
          addingTagCount: tagLabels.length,
        },
        'Using "keep" mode - preserving all existing labels',
      )
    } else if (deps.removedLabelMode === 'special-label') {
      // Get all tracked labels for this rating key from the tracking table
      const trackedLabels =
        await deps.db.getTrackedLabelsForRatingKey(ratingKey)
      const allTrackedAppLabels = new Set<string>()

      // Collect all tracked app-managed labels from tracking records (excluding removal markers)
      for (const tracking of trackedLabels) {
        for (const label of tracking.labels_applied) {
          if (
            isAppUserLabel(label, deps.config.labelPrefix) &&
            !label
              .toLowerCase()
              .startsWith(deps.removedLabelPrefix.toLowerCase())
          ) {
            allTrackedAppLabels.add(label)
          }
        }
      }

      // Find which labels are non-user, non-tag labels that should be preserved
      const nonAppLabels = cleanedExistingLabels.filter(
        (label) =>
          !isAppUserLabel(label, deps.config.labelPrefix) &&
          !isAppTagLabel(label, deps.config.labelPrefix),
      )

      // In special-label mode, preserve all tracked user labels and add new ones
      // Remove any existing "removed" labels since someone is adding content
      const existingRemovedLabels = cleanedExistingLabels.filter((label) =>
        label.toLowerCase().startsWith(deps.removedLabelPrefix.toLowerCase()),
      )

      finalLabels = [
        ...new Set([
          ...nonAppLabels.filter(
            (label) =>
              !label
                .toLowerCase()
                .startsWith(deps.removedLabelPrefix.toLowerCase()),
          ),
          ...Array.from(allTrackedAppLabels),
          ...userLabels,
          ...tagLabels,
        ]),
      ]

      deps.logger.debug(
        {
          ratingKey,
          mode: 'special-label',
          allTrackedAppLabels: Array.from(allTrackedAppLabels),
          removedExistingRemovedLabels: existingRemovedLabels,
          addingUserLabels: userLabels,
          finalLabelsCount: finalLabels.length,
        },
        'Using "special-label" mode - preserving tracked labels',
      )
    } else {
      // Default 'remove' mode - filter out existing app labels and add current ones
      const nonAppLabels = cleanedExistingLabels.filter(
        (label) =>
          !isAppUserLabel(label, deps.config.labelPrefix) &&
          !isAppTagLabel(label, deps.config.labelPrefix),
      )
      finalLabels = [...new Set([...nonAppLabels, ...userLabels, ...tagLabels])]

      deps.logger.debug(
        {
          ratingKey,
          mode: 'remove',
          preservedCount: nonAppLabels.length,
          userLabelCount: userLabels.length,
          tagLabelCount: tagLabels.length,
        },
        'Using remove mode - filtering obsolete labels',
      )
    }

    deps.logger.debug(
      {
        ratingKey,
        existingLabels,
        userLabels,
        tagLabels,
        finalLabels,
        mode: deps.removedLabelMode,
        hasWebhookTags: tagLabels.length > 0,
      },
      'Applying combined labels to Plex item',
    )

    // Update the labels in Plex with single API call
    const success = await deps.plexServer.updateLabels(ratingKey, finalLabels)

    if (success) {
      deps.logger.debug(
        {
          totalLabels: finalLabels.length,
          userCount: users.length,
          tagCount: tagLabels.length,
          ratingKey,
        },
        `Successfully updated combined labels for item ${ratingKey}`,
      )

      // Track combined user and tag labels in the database for each watchlist item
      let trackingErrors = 0
      for (const user of users) {
        const userLabel = `${deps.config.labelPrefix}:${user.username}`
        // Combine user label with tag labels for this watchlist item
        const combinedLabels = [userLabel, ...tagLabels]

        try {
          // Get the content key from the watchlist item for proper tracking
          const watchlistItem = await deps.db.getWatchlistItemById(
            user.watchlist_id,
          )
          const contentGuids = watchlistItem
            ? parseGuids(watchlistItem.guids)
            : [ratingKey]

          if (
            watchlistItem?.type &&
            !['movie', 'show'].includes(watchlistItem.type)
          ) {
            deps.logger.warn(
              {
                watchlistId: user.watchlist_id,
                type: watchlistItem.type,
                fallback: contentType === 'show' ? 'show' : 'movie',
              },
              'Unexpected content type, using fallback',
            )
          }
          const fallbackType: 'movie' | 'show' =
            contentType === 'show' ? 'show' : 'movie'
          const contentTypeToUse: 'movie' | 'show' =
            watchlistItem?.type === 'show'
              ? 'show'
              : watchlistItem?.type === 'movie'
                ? 'movie'
                : fallbackType
          await deps.db.trackPlexLabels(
            contentGuids,
            contentTypeToUse,
            user.user_id,
            ratingKey,
            combinedLabels,
          )
          deps.logger.debug(
            {
              watchlistId: user.watchlist_id,
              ratingKey,
              userLabel,
              tagLabels,
              combinedLabels,
            },
            'Successfully tracked combined labels in database',
          )
        } catch (error) {
          deps.logger.error(
            {
              error,
              watchlistId: user.watchlist_id,
            },
            `Failed to track combined labels in database for watchlist ${user.watchlist_id}`,
          )
          trackingErrors++
        }
      }

      if (trackingErrors > 0) {
        deps.logger.warn(
          {
            ratingKey,
            successfulTracks: users.length - trackingErrors,
            failedTracks: trackingErrors,
          },
          `Labels applied to Plex but ${trackingErrors} tracking records failed to save`,
        )
      }
    } else {
      deps.logger.warn(`Failed to update combined labels for item ${ratingKey}`)
    }

    return success
  } catch (error) {
    deps.logger.error(
      { error },
      `Error applying combined labels to item ${ratingKey}`,
    )
    return false
  }
}
