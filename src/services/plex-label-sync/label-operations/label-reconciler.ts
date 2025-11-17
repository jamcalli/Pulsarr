/**
 * Label Reconciliation Module
 *
 * Handles the reconciliation of labels for content items by comparing current vs desired state.
 * Supports both user labels and tag labels with proper tracking and cleanup.
 */

import type {
  ContentWithUsers,
  LabelReconciliationResult,
  PlexContentItems,
  RadarrMovieWithTags,
  SonarrSeriesWithTags,
} from '@root/types/plex-label-sync.types.js'
import type { PlexLabelSyncConfig } from '@schemas/plex/label-sync-config.schema.js'
import type { DatabaseService } from '@services/database.service.js'
import type { PlexServerService } from '@services/plex-server.service.js'
import type { FastifyBaseLogger } from 'fastify'
import {
  matchPlexMovieToRadarr,
  matchPlexSeriesToSonarr,
} from '../matching/index.js'
import { updateTrackingForContent } from '../tracking/content-tracker.js'
import {
  filterAndFormatTagsAsLabels,
  getRemovedLabel,
  isAppUserLabel,
  isManagedLabel,
} from './label-validator.js'

export interface LabelReconcilerDeps {
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
 * Reconciles labels for all Plex items representing the same content.
 * Ensures user and tag labels are properly synchronized with desired state.
 *
 * @param contentItems - Content with associated Plex items
 * @param radarrMoviesWithTags - Radarr movies with tags for tag sync
 * @param sonarrSeriesWithTags - Sonarr series with tags for tag sync
 * @param deps - Service dependencies
 * @returns Reconciliation result
 */
export async function reconcileLabelsForContent(
  contentItems: PlexContentItems,
  radarrMoviesWithTags: RadarrMovieWithTags[],
  sonarrSeriesWithTags: SonarrSeriesWithTags[],
  deps: LabelReconcilerDeps,
): Promise<LabelReconciliationResult> {
  const { content, plexItems } = contentItems
  let totalLabelsAdded = 0
  let totalLabelsRemoved = 0

  try {
    // Calculate desired user labels based on complete user set
    const desiredUserLabels = content.users.map(
      (user) => `${deps.config.labelPrefix}:${user.username}`,
    )

    // Calculate desired tag labels if tag sync is enabled
    const desiredTagLabels: string[] = []
    let tagInstanceName = ''

    if (deps.config.tagSync.enabled && plexItems.length > 0) {
      // Use the first Plex item for tag matching (they all represent the same content)
      const plexItem = plexItems[0]

      if (content.type === 'movie') {
        const match = await matchPlexMovieToRadarr(
          plexItem,
          radarrMoviesWithTags,
          deps.plexServer,
          deps.logger,
        )
        if (match) {
          desiredTagLabels.push(
            ...filterAndFormatTagsAsLabels(
              match.tags,
              deps.tagPrefix,
              deps.removedTagPrefix,
              deps.config.labelPrefix,
            ),
          )
          tagInstanceName = match.instanceName
        }
      } else if (content.type === 'show') {
        const match = await matchPlexSeriesToSonarr(
          plexItem,
          sonarrSeriesWithTags,
          deps.plexServer,
          deps.logger,
        )
        if (match) {
          desiredTagLabels.push(
            ...filterAndFormatTagsAsLabels(
              match.tags,
              deps.tagPrefix,
              deps.removedTagPrefix,
              deps.config.labelPrefix,
            ),
          )
          tagInstanceName = match.instanceName
        }
      }
    }

    // Combine all desired labels (user + tag labels)
    const allDesiredLabels = [...desiredUserLabels, ...desiredTagLabels]

    deps.logger.debug(
      {
        primaryGuid: content.primaryGuid,
        title: content.title,
        userCount: content.users.length,
        desiredUserLabels,
        desiredTagLabels,
        allDesiredLabels,
        tagInstanceName,
        plexItemCount: plexItems.length,
      },
      'Starting consolidated label reconciliation for content',
    )

    // Process each Plex item (handles multiple versions of same content)
    const appliedRemovedLabels = new Map<string, string>() // ratingKey -> removedLabel
    for (const plexItem of plexItems) {
      const result = await reconcileLabelsForSingleItem(
        plexItem.ratingKey,
        allDesiredLabels,
        desiredUserLabels,
        desiredTagLabels,
        content,
        deps,
      )

      totalLabelsAdded += result.labelsAdded
      totalLabelsRemoved += result.labelsRemoved

      // Collect special removed labels for tracking
      if (result.success && result.specialRemovedLabel) {
        appliedRemovedLabels.set(plexItem.ratingKey, result.specialRemovedLabel)
      }

      if (!result.success) {
        deps.logger.warn(
          {
            ratingKey: plexItem.ratingKey,
            title: plexItem.title,
            error: result.error,
          },
          'Failed to reconcile labels for Plex item',
        )
      }
    }

    // Update tracking table to match final state (user + tag labels + removed labels)
    await updateTrackingForContent(
      content,
      plexItems,
      allDesiredLabels,
      desiredUserLabels,
      desiredTagLabels,
      appliedRemovedLabels,
      deps,
    )

    deps.logger.debug(
      {
        primaryGuid: content.primaryGuid,
        title: content.title,
        labelsAdded: totalLabelsAdded,
        labelsRemoved: totalLabelsRemoved,
      },
      'Completed label reconciliation for content',
    )

    return {
      success: true,
      labelsAdded: totalLabelsAdded,
      labelsRemoved: totalLabelsRemoved,
    }
  } catch (error) {
    deps.logger.error(
      {
        primaryGuid: content.primaryGuid,
        title: content.title,
        error,
      },
      'Error during label reconciliation for content',
    )

    return {
      success: false,
      labelsAdded: totalLabelsAdded,
      labelsRemoved: totalLabelsRemoved,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Reconciles labels for a single Plex item by comparing current vs desired state.
 *
 * @param ratingKey - The Plex rating key
 * @param allDesiredLabels - All labels that should exist (user + tag)
 * @param desiredUserLabels - Array of user labels that should exist
 * @param desiredTagLabels - Array of tag labels that should exist
 * @param content - The content being processed (for logging)
 * @param deps - Service dependencies
 * @returns Reconciliation result for this item
 */
export async function reconcileLabelsForSingleItem(
  ratingKey: string,
  allDesiredLabels: string[],
  desiredUserLabels: string[],
  desiredTagLabels: string[],
  content: ContentWithUsers,
  deps: LabelReconcilerDeps,
): Promise<LabelReconciliationResult> {
  try {
    // Get current labels from Plex
    const metadata = await deps.plexServer.getMetadata(ratingKey)
    const currentLabels = metadata?.Label?.map((label) => label.tag) || []

    // Separate app-managed labels (user + tag) from other labels
    const currentAppLabels = currentLabels.filter((label) =>
      isAppUserLabel(label, deps.config.labelPrefix),
    )
    const nonAppLabels = currentLabels.filter(
      (label) => !isAppUserLabel(label, deps.config.labelPrefix),
    )

    // Calculate label changes needed for ALL app-managed labels
    const labelsToAdd = allDesiredLabels.filter(
      (label) => !currentAppLabels.includes(label),
    )
    const labelsToRemove = currentAppLabels.filter(
      (label) => !allDesiredLabels.includes(label),
    )

    // Handle removed labels based on configuration
    let finalLabels: string[]
    let specialRemovedLabel: string | null = null

    if (deps.removedLabelMode === 'keep') {
      // Keep all existing labels and add new ones
      finalLabels = [...new Set([...currentLabels, ...labelsToAdd])]
    } else if (deps.removedLabelMode === 'special-label') {
      // Handle special "removed" label logic:
      // - Add removed label whenever NO user labels exist (safe for deletion),
      //   regardless of tag presence.
      // - If user labels exist, removed label should be cleaned up (content still wanted)
      if (desiredUserLabels.length === 0) {
        // No user labels exist, safe to add removed label for deletion
        specialRemovedLabel = getRemovedLabel(deps.removedLabelPrefix)
        deps.logger.debug(
          {
            contentTitle: content.title,
            specialRemovedLabel,
            desiredUserLabelsCount: desiredUserLabels.length,
          },
          'Generated special removed label',
        )
        const nonAppWithoutRemoved = nonAppLabels.filter(
          (label) =>
            !label
              .toLowerCase()
              .startsWith(deps.removedLabelPrefix.toLowerCase()),
        )
        finalLabels = [
          ...new Set([...nonAppWithoutRemoved, specialRemovedLabel]),
        ]
        deps.logger.debug(
          `Added removed label for "${content.title}" - no active users, safe for deletion`,
        )
      } else {
        // User labels exist - preserve current user labels and add desired labels
        // (Removed labels will be cleaned up in the subsequent cleanup step below)
        finalLabels = [...new Set([...nonAppLabels, ...allDesiredLabels])]
      }
    } else {
      // Default 'remove' mode - clean removal of obsolete labels
      finalLabels = [...new Set([...nonAppLabels, ...allDesiredLabels])]
    }

    // Remove any existing "removed" labels when users are re-adding content
    if (desiredUserLabels.length > 0) {
      const removedLabels = finalLabels.filter((label) =>
        label.toLowerCase().startsWith(deps.removedLabelPrefix.toLowerCase()),
      )
      if (removedLabels.length > 0 && !specialRemovedLabel) {
        finalLabels = finalLabels.filter(
          (label) => !removedLabels.includes(label),
        )
        deps.logger.debug(
          `Cleaned up removed label for "${content.title}" - active users still want this content`,
        )
      }
    }

    deps.logger.debug(
      {
        ratingKey,
        contentTitle: content.title,
        currentLabels,
        currentAppLabels,
        desiredUserLabels,
        desiredTagLabels,
        allDesiredLabels,
        labelsToAdd,
        labelsToRemove,
        finalLabels,
        mode: deps.removedLabelMode,
        specialRemovedLabel,
      },
      'Consolidated label reconciliation plan for Plex item',
    )

    // Apply the updated labels to Plex
    const success = await deps.plexServer.updateLabels(ratingKey, finalLabels)

    if (success) {
      // Recompute deltas across all Pulsarr-managed labels, including the special "removed" marker
      const toLowerSet = (arr: string[]) =>
        new Set(arr.map((s) => s.toLowerCase()))
      const currentManaged = toLowerSet(
        currentLabels.filter((label) =>
          isManagedLabel(
            label,
            deps.config.labelPrefix,
            deps.removedLabelPrefix,
          ),
        ),
      )
      const finalManaged = toLowerSet(
        finalLabels.filter((label) =>
          isManagedLabel(
            label,
            deps.config.labelPrefix,
            deps.removedLabelPrefix,
          ),
        ),
      )
      const addedCount = [...finalManaged].filter(
        (l) => !currentManaged.has(l),
      ).length
      const removedCount = [...currentManaged].filter(
        (l) => !finalManaged.has(l),
      ).length

      deps.logger.debug(
        {
          ratingKey,
          contentTitle: content.title,
          labelsAdded: addedCount,
          labelsRemoved: removedCount,
        },
        'Successfully updated labels for Plex item',
      )

      return {
        success: true,
        labelsAdded: addedCount,
        labelsRemoved: removedCount,
        specialRemovedLabel: specialRemovedLabel || undefined,
      }
    }

    deps.logger.warn(
      {
        ratingKey,
        contentTitle: content.title,
      },
      'Failed to update labels for Plex item',
    )

    return {
      success: false,
      labelsAdded: 0,
      labelsRemoved: 0,
      error: 'Failed to update labels in Plex',
    }
  } catch (error) {
    deps.logger.error(
      {
        ratingKey,
        contentTitle: content.title,
        error,
      },
      'Error reconciling labels for Plex item',
    )

    return {
      success: false,
      labelsAdded: 0,
      labelsRemoved: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
