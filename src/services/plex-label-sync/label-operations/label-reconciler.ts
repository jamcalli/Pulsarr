/**
 * Label Reconciliation Module
 *
 * Handles the reconciliation of labels for content items by comparing current vs desired state.
 * Supports both user labels and tag labels with proper tracking and cleanup.
 */

import type {
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
  computeFinalLabels,
  filterAndFormatTagsAsLabels,
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
 * Projects caller deps into the narrower LabelReconcilerDeps interface.
 */
export function buildReconcilerDeps(deps: {
  plexServer: PlexServerService
  db: DatabaseService
  logger: FastifyBaseLogger
  config: PlexLabelSyncConfig
  removedLabelMode: 'remove' | 'keep' | 'special-label'
  removedLabelPrefix: string
  tagPrefix: string
  removedTagPrefix: string
}): LabelReconcilerDeps {
  return {
    plexServer: deps.plexServer,
    db: deps.db,
    logger: deps.logger,
    config: deps.config,
    removedLabelMode: deps.removedLabelMode,
    removedLabelPrefix: deps.removedLabelPrefix,
    tagPrefix: deps.tagPrefix,
    removedTagPrefix: deps.removedTagPrefix,
  }
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

    deps.logger.debug(
      {
        primaryGuid: content.primaryGuid,
        title: content.title,
        userCount: content.users.length,
        desiredUserLabels,
        desiredTagLabels,
        tagInstanceName,
        plexItemCount: plexItems.length,
      },
      'Starting consolidated label reconciliation for content',
    )

    // Process each Plex item (handles multiple versions of same content)
    const appliedRemovedLabels = new Map<string, string>() // ratingKey -> removedLabel
    const failures: string[] = []

    for (const plexItem of plexItems) {
      const result = await reconcileLabelsForSingleItem(
        plexItem.ratingKey,
        desiredUserLabels,
        desiredTagLabels,
        content.title,
        deps,
      )

      totalLabelsAdded += result.labelsAdded
      totalLabelsRemoved += result.labelsRemoved

      // Collect special removed labels for tracking
      if (result.success && result.specialRemovedLabel) {
        appliedRemovedLabels.set(plexItem.ratingKey, result.specialRemovedLabel)
      }

      if (!result.success) {
        failures.push(plexItem.ratingKey)
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

    // Only update tracking table if all items succeeded
    // This ensures DB tracking stays in sync with actual Plex state
    if (failures.length === 0) {
      await updateTrackingForContent(
        content,
        plexItems,
        desiredUserLabels,
        desiredTagLabels,
        appliedRemovedLabels,
        deps,
      )
    } else {
      deps.logger.warn(
        {
          primaryGuid: content.primaryGuid,
          title: content.title,
          failedRatingKeys: failures,
          failureCount: failures.length,
        },
        'Skipping tracking update due to reconciliation failures',
      )
    }

    deps.logger.debug(
      {
        primaryGuid: content.primaryGuid,
        title: content.title,
        labelsAdded: totalLabelsAdded,
        labelsRemoved: totalLabelsRemoved,
        success: failures.length === 0,
      },
      'Completed label reconciliation for content',
    )

    return {
      success: failures.length === 0,
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
 * Callers must provide the COMPLETE desired state (all users + all tags).
 *
 * Used by batch sync, webhook sync, and pending sync - the single implementation
 * for all label reconciliation regardless of trigger source.
 */
export async function reconcileLabelsForSingleItem(
  ratingKey: string,
  desiredUserLabels: string[],
  desiredTagLabels: string[],
  title: string,
  deps: LabelReconcilerDeps,
): Promise<LabelReconciliationResult> {
  try {
    const metadata = await deps.plexServer.getMetadata(ratingKey)
    const currentLabels = metadata?.Label?.map((label) => label.tag) || []

    const { finalLabels, specialRemovedLabel } = computeFinalLabels({
      currentLabels,
      desiredUserLabels,
      desiredTagLabels,
      mode: deps.removedLabelMode,
      labelPrefix: deps.config.labelPrefix,
      removedLabelPrefix: deps.removedLabelPrefix,
    })

    deps.logger.debug(
      {
        ratingKey,
        contentTitle: title,
        currentLabels,
        desiredUserLabels,
        desiredTagLabels,
        finalLabels,
        mode: deps.removedLabelMode,
        specialRemovedLabel,
      },
      'Label reconciliation plan for Plex item',
    )

    const success = await deps.plexServer.updateLabels(ratingKey, finalLabels)

    if (success) {
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
          contentTitle: title,
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
      { ratingKey, contentTitle: title },
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
      { ratingKey, contentTitle: title, error },
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
