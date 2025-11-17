/**
 * Label Removal Functions
 *
 * Handles bulk removal of all app-managed labels and label reset operations.
 */

import type { PlexLabelSyncConfig } from '@schemas/plex/label-sync-config.schema.js'
import type { DatabaseService } from '@services/database.service.js'
import type { PlexServerService } from '@services/plex-server.service.js'
import { getGuidMatchScore, parseGuids } from '@utils/guid-handler.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import pLimit from 'p-limit'

import { isManagedLabel } from '../label-operations/index.js'

/**
 * Dependencies required for label removal operations
 */
export interface LabelRemoverDeps {
  plexServer: PlexServerService
  db: DatabaseService
  logger: FastifyBaseLogger
  config: PlexLabelSyncConfig
  fastify: FastifyInstance
  labelPrefix: string
  removedLabelPrefix: string
  removedLabelMode: 'remove' | 'keep' | 'special-label'
}

/**
 * Removes all Pulsarr-created labels from Plex content items that are tracked in the database.
 * This preserves any other labels that were not created by Pulsarr.
 *
 * @param deps - Service dependencies
 * @returns Promise resolving to removal results
 */
export async function removeAllLabels(deps: LabelRemoverDeps): Promise<{
  processed: number
  removed: number
  failed: number
}> {
  if (!deps.config.enabled) {
    deps.logger.debug('Plex label sync is disabled, skipping label removal')
    return { processed: 0, removed: 0, failed: 0 }
  }

  const operationId = `plex-label-removal-${Date.now()}`
  const emitProgress = deps.fastify.progress.hasActiveConnections()

  const result = {
    processed: 0,
    removed: 0,
    failed: 0,
  }

  try {
    deps.logger.info('Starting bulk Plex label removal')

    if (emitProgress) {
      deps.fastify.progress.emit({
        operationId,
        type: 'plex-label-removal',
        phase: 'start',
        progress: 5,
        message: 'Starting Plex label removal...',
      })
    }

    // Get all tracked labels from database
    const trackedLabels = await deps.db.getAllTrackedLabels()
    deps.logger.info(`Found ${trackedLabels.length} tracked labels to process`)

    if (emitProgress) {
      deps.fastify.progress.emit({
        operationId,
        type: 'plex-label-removal',
        phase: 'fetching-data',
        progress: 15,
        message: `Found ${trackedLabels.length} tracked labels to process`,
      })
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

    if (emitProgress) {
      deps.fastify.progress.emit({
        operationId,
        type: 'plex-label-removal',
        phase: 'processing-content',
        progress: 25,
        message: `Processing ${labelsByRatingKey.size} items`,
      })
    }

    // Process label removal in parallel with configurable concurrency limit
    const concurrencyLimit = deps.config.concurrencyLimit || 5
    const limit = pLimit(concurrencyLimit)
    let processedCount = 0
    const ratingKeyEntries = Array.from(labelsByRatingKey.entries())
    const successfulCleanupOperations: Array<{
      plexRatingKey: string
      labelsToRemove: string[]
    }> = []

    const labelRemovalResults = await Promise.allSettled(
      ratingKeyEntries.map(([ratingKey, labels]) =>
        limit(async () => {
          const itemResult = {
            processed: 0,
            removed: 0,
            failed: 0,
          }

          try {
            itemResult.processed++
            processedCount++

            // Report progress during processing
            if (emitProgress && ratingKeyEntries.length > 0) {
              const processProgress =
                25 + Math.floor((processedCount / ratingKeyEntries.length) * 65)
              deps.fastify.progress.emit({
                operationId,
                type: 'plex-label-removal',
                phase: 'processing-content',
                progress: processProgress,
                message: `Processing item ${processedCount}/${ratingKeyEntries.length}`,
              })
            }

            // Get current labels and remove only Pulsarr-created labels
            const metadata = await deps.plexServer.getMetadata(ratingKey)
            const currentLabels =
              metadata?.Label?.map((label) => label.tag) || []

            deps.logger.debug(
              {
                currentLabels,
                labelsToRemove: labels,
                ratingKey,
              },
              `Found ${currentLabels.length} current labels for rating key ${ratingKey}`,
            )

            // If we have current labels, filter out all Pulsarr-managed labels (tracked + untracked)
            if (currentLabels.length > 0) {
              // Remove all managed labels (user labels + tag labels + removed markers)
              const filteredLabels = currentLabels.filter(
                (label) =>
                  !isManagedLabel(
                    label,
                    deps.config.labelPrefix,
                    deps.removedLabelPrefix,
                  ),
              )

              deps.logger.debug(
                {
                  filteredLabels,
                  ratingKey,
                  originalCount: currentLabels.length,
                  filteredCount: filteredLabels.length,
                },
                `Filtered labels for rating key ${ratingKey}: ${currentLabels.length} -> ${filteredLabels.length}`,
              )

              const success = await deps.plexServer.updateLabels(
                ratingKey,
                filteredLabels,
              )

              if (success) {
                itemResult.removed += labels.length

                // Collect successful operations for bulk cleanup
                successfulCleanupOperations.push({
                  plexRatingKey: ratingKey,
                  labelsToRemove: labels,
                })

                deps.logger.debug(
                  {
                    ratingKey,
                    labels,
                  },
                  `Successfully removed ${labels.length} Pulsarr labels from Plex content`,
                )
              } else {
                itemResult.failed += labels.length
                deps.logger.warn(
                  {
                    ratingKey,
                    labels,
                  },
                  `Failed to remove labels from rating key ${ratingKey}`,
                )
              }
            } else {
              // No current labels found via API - this could be the metadata API issue
              // Use the removeSpecificLabels method and include potential removed markers
              deps.logger.warn(
                {
                  trackedLabels: labels,
                  ratingKey,
                },
                `No current labels found via API for rating key ${ratingKey}, but tracking table indicates ${labels.length} labels should exist. Attempting removal including untracked removed markers.`,
              )

              // Include potential removed markers that might not be tracked
              const labelsWithRemoved = Array.from(
                new Set([...labels, deps.removedLabelPrefix]),
              )
              const success = await deps.plexServer.removeSpecificLabels(
                ratingKey,
                labelsWithRemoved,
              )

              if (success) {
                itemResult.removed += labelsWithRemoved.length

                // Collect successful operations for bulk cleanup
                successfulCleanupOperations.push({
                  plexRatingKey: ratingKey,
                  labelsToRemove: labelsWithRemoved,
                })

                deps.logger.debug(
                  {
                    ratingKey,
                    trackedLabels: labels,
                    allLabelsRemoved: labelsWithRemoved,
                  },
                  `Successfully removed ${labelsWithRemoved.length} labels (${labels.length} tracked + removed markers) using fallback method`,
                )
              } else {
                itemResult.failed += labels.length
                deps.logger.error(
                  {
                    ratingKey,
                    labels,
                  },
                  `Failed to remove tracked labels even with fallback method for rating key ${ratingKey}`,
                )
              }
            }
          } catch (error) {
            deps.logger.error(
              {
                error,
                ratingKey,
              },
              `Failed to remove labels from Plex content ${ratingKey}`,
            )
            itemResult.failed++
          }

          return itemResult
        }),
      ),
    )

    // Aggregate results
    for (const promiseResult of labelRemovalResults) {
      if (promiseResult.status === 'fulfilled') {
        const itemResult = promiseResult.value
        result.processed += itemResult.processed
        result.removed += itemResult.removed
        result.failed += itemResult.failed
      } else {
        deps.logger.error(
          {
            error: promiseResult.reason,
          },
          'Promise rejected during parallel label removal',
        )
        result.failed++
      }
    }

    // Execute bulk cleanup for successfully removed labels
    if (successfulCleanupOperations.length > 0) {
      deps.logger.debug(
        `Executing bulk cleanup for ${successfulCleanupOperations.length} operations`,
      )
      try {
        const cleanupResult = await deps.db.removeTrackedLabels(
          successfulCleanupOperations,
        )
        deps.logger.debug(
          {
            successfulCount: cleanupResult.processedCount,
            failedIds: cleanupResult.failedIds,
          },
          `Bulk cleanup completed: ${cleanupResult.processedCount} successful, ${cleanupResult.failedIds.length} failed`,
        )
        if (cleanupResult.failedIds.length > 0) {
          deps.logger.warn(
            `Some tracking cleanup operations failed for rating keys: ${cleanupResult.failedIds.join(', ')}`,
          )
        }
      } catch (cleanupError) {
        deps.logger.warn(
          {
            error: cleanupError,
          },
          'Bulk tracking cleanup failed',
        )
      }
    }

    // Clean up tracking records from database
    await deps.db.clearAllLabelTracking()

    deps.logger.info(result, 'Bulk Plex label removal completed')

    if (emitProgress) {
      deps.fastify.progress.emit({
        operationId,
        type: 'plex-label-removal',
        phase: 'complete',
        progress: 100,
        message: `Completed Plex label removal: removed ${result.removed} labels from ${result.processed} items, ${result.failed} failed`,
      })
    }

    return result
  } catch (error) {
    deps.logger.error({ error }, 'Error in bulk Plex label removal:')

    if (emitProgress) {
      deps.fastify.progress.emit({
        operationId,
        type: 'plex-label-removal',
        phase: 'error',
        progress: 100,
        message: `Error removing Plex labels: ${error}`,
      })
    }

    throw error
  }
}

/**
 * Reset Plex labels and tracking table based on current removal mode settings.
 * Accepts watchlist items as parameter OR compiles existing watchlist if called standalone.
 * Reuses existing cleanup logic to handle all removal modes (remove/keep/special-label).
 *
 * @param watchlistItems - Optional array of watchlist items to process. If not provided, all watchlist items are fetched.
 * @param deps - Service dependencies
 * @returns Promise resolving to processing results
 */
export async function resetLabels(
  watchlistItems:
    | Array<{
        id: string | number
        user_id: number
        guids?: string[] | string
        title: string
        type?: string
        key: string | null
      }>
    | undefined,
  deps: LabelRemoverDeps,
): Promise<{ processed: number; updated: number; failed: number }> {
  if (!deps.config.enabled) {
    deps.logger.warn('Plex label sync is disabled, skipping label reset')
    return { processed: 0, updated: 0, failed: 0 }
  }

  const operationId = `plex-label-reset-${Date.now()}`
  const emitProgress = deps.fastify.progress.hasActiveConnections()

  try {
    deps.logger.info(
      {
        mode: deps.removedLabelMode,
        providedItems: watchlistItems?.length || 0,
      },
      'Starting Plex label reset based on current removal mode',
    )

    if (emitProgress) {
      deps.fastify.progress.emit({
        operationId,
        type: 'plex-label-sync',
        phase: 'start',
        progress: 5,
        message: 'Starting Plex label reset...',
      })
    }

    // Step 1: Get watchlist items (compile if not provided, same pattern as syncAllLabels)
    let items = watchlistItems
    if (!items) {
      if (emitProgress) {
        deps.fastify.progress.emit({
          operationId,
          type: 'plex-label-sync',
          phase: 'fetching-data',
          progress: 10,
          message: 'Fetching all watchlist items...',
        })
      }
      const [movieItems, showItems] = await Promise.all([
        deps.db.getAllMovieWatchlistItems(),
        deps.db.getAllShowWatchlistItems(),
      ])
      items = [...movieItems, ...showItems]
      deps.logger.info(`Compiled ${items.length} watchlist items for reset`)
    }

    if (items.length === 0) {
      deps.logger.info('No watchlist items to process for reset')
      return { processed: 0, updated: 0, failed: 0 }
    }

    if (emitProgress) {
      deps.fastify.progress.emit({
        operationId,
        type: 'plex-label-sync',
        phase: 'processing-content',
        progress: 25,
        message: `Processing ${items.length} watchlist items with mode: ${deps.removedLabelMode}...`,
      })
    }

    // Step 2: Find orphaned tracking entries (tracking entries without corresponding watchlist items)
    if (emitProgress) {
      deps.fastify.progress.emit({
        operationId,
        type: 'plex-label-sync',
        phase: 'processing-content',
        progress: 30,
        message: 'Finding orphaned tracking entries...',
      })
    }

    // Get all tracking entries using the proper database method
    const allTrackingEntries = await deps.db.getAllTrackedLabels()

    // Find orphaned tracking entries using weighted GUID matching
    const orphanedEntries = []
    for (const trackingEntry of allTrackingEntries) {
      let foundMatch = false

      // Check if this tracking entry matches any current watchlist item
      for (const watchlistItem of items) {
        // Only compare items from the same user and content type
        if (trackingEntry.user_id !== watchlistItem.user_id) {
          continue
        }

        const watchlistItemType = watchlistItem.type || 'movie'
        if (trackingEntry.content_type !== watchlistItemType) {
          continue
        }

        const watchlistGuids = parseGuids(watchlistItem.guids)
        const trackingGuids = trackingEntry.content_guids

        // Check if tracking entry contains real content GUIDs or just rating key
        const trackingContainsRealGuids = trackingGuids.some((guid) =>
          guid.includes(':'),
        )

        let matchScore = 0

        if (trackingContainsRealGuids) {
          // Use weighted GUID matching for real GUIDs
          matchScore = getGuidMatchScore(trackingGuids, watchlistGuids)
        } else {
          // Tracking entry only has rating key, check if watchlist item has the same key
          if (watchlistItem.key && trackingGuids.includes(watchlistItem.key)) {
            // This is a fallback match - assign score of 1
            matchScore = 1
          }
        }

        if (matchScore > 0) {
          foundMatch = true
          deps.logger.debug(
            {
              trackingId: trackingEntry.id,
              ratingKey: trackingEntry.plex_rating_key,
              trackingGuids,
              watchlistGuids,
              trackingContainsRealGuids,
              matchScore,
            },
            `Tracking entry matched watchlist item "${watchlistItem.title}" (score: ${matchScore}, method: ${trackingContainsRealGuids ? 'GUID' : 'rating-key'})`,
          )
          break
        }
      }

      // If no match found, this tracking entry is orphaned
      if (!foundMatch) {
        orphanedEntries.push({
          id: trackingEntry.id, // This will be unused but required by interface
          title: 'Orphaned Item', // Title is not available in tracking table
          key: '', // Key is not needed for cleanup
          user_id: trackingEntry.user_id,
          guids: trackingEntry.content_guids,
          contentType: trackingEntry.content_type as 'movie' | 'show',
          trackingId: trackingEntry.id, // Keep reference to tracking entry ID
          plexRatingKey: trackingEntry.plex_rating_key,
          labelsApplied: trackingEntry.labels_applied,
        })
      }
    }

    if (orphanedEntries.length === 0) {
      deps.logger.info('No orphaned tracking entries found')
      if (emitProgress) {
        deps.fastify.progress.emit({
          operationId,
          type: 'plex-label-sync',
          phase: 'complete',
          progress: 100,
          message: 'Reset complete - no orphaned entries found',
        })
      }
      return { processed: items.length, updated: 0, failed: 0 }
    }

    deps.logger.info(
      `Found ${orphanedEntries.length} orphaned tracking entries to clean up`,
    )
    if (emitProgress) {
      deps.fastify.progress.emit({
        operationId,
        type: 'plex-label-sync',
        phase: 'cleanup',
        progress: 50,
        message: `Cleaning up ${orphanedEntries.length} orphaned entries...`,
      })
    }

    // Step 3: Process orphaned entries based on removal mode
    let processedCount = 0
    let failedCount = 0

    if (deps.removedLabelMode === 'keep') {
      deps.logger.info(
        'Removal mode is "keep", preserving orphaned labels and tracking entries',
      )
      // In keep mode, we don't remove anything
      processedCount = orphanedEntries.length
    } else if (deps.removedLabelMode === 'remove') {
      // Remove labels from Plex and delete tracking entries
      for (const entry of orphanedEntries) {
        try {
          // Remove labels from Plex
          if (entry.labelsApplied.length > 0) {
            await deps.plexServer.removeSpecificLabels(
              entry.plexRatingKey,
              entry.labelsApplied,
            )
          }

          // Delete tracking entry
          await deps.db.cleanupUserContentTracking(
            entry.guids,
            entry.contentType,
            entry.user_id,
          )

          processedCount++
        } catch (error) {
          deps.logger.error(
            {
              error,
              ratingKey: entry.plexRatingKey,
            },
            `Failed to clean up orphaned entry for rating key ${entry.plexRatingKey}`,
          )
          failedCount++
        }
      }
    } else if (deps.removedLabelMode === 'special-label') {
      // Replace existing labels with special "removed" label
      for (const entry of orphanedEntries) {
        try {
          // Remove existing labels and apply special removed label
          const removedLabel = deps.removedLabelPrefix || 'pulsarr:removed'
          await deps.plexServer.updateLabels(entry.plexRatingKey, [
            removedLabel,
          ])

          // Delete the old orphaned tracking entry first
          await deps.db.cleanupUserContentTracking(
            entry.guids,
            entry.contentType,
            entry.user_id || null,
          )

          // Create new tracking entry with removed label
          await deps.db.trackPlexLabels(
            entry.guids,
            entry.contentType,
            null, // System operation for removed labels
            entry.plexRatingKey,
            [removedLabel],
          )

          processedCount++
        } catch (error) {
          deps.logger.error(
            {
              error,
              ratingKey: entry.plexRatingKey,
            },
            `Failed to apply special label to orphaned entry for rating key ${entry.plexRatingKey}`,
          )
          failedCount++
        }
      }
    }

    if (emitProgress) {
      deps.fastify.progress.emit({
        operationId,
        type: 'plex-label-sync',
        phase: 'complete',
        progress: 100,
        message: 'Reset complete',
      })
    }

    deps.logger.info(
      {
        mode: deps.removedLabelMode,
        orphanedEntriesFound: orphanedEntries.length,
        orphanedEntriesProcessed: processedCount,
        orphanedEntriesFailed: failedCount,
      },
      'Plex label reset completed successfully',
    )

    return {
      processed: orphanedEntries.length,
      updated: processedCount,
      failed: failedCount,
    }
  } catch (error) {
    deps.logger.error({ error }, 'Error during Plex label reset:')
    if (emitProgress) {
      deps.fastify.progress.emit({
        operationId,
        type: 'plex-label-sync',
        phase: 'error',
        progress: 100,
        message: 'Reset failed',
      })
    }
    throw error
  }
}
