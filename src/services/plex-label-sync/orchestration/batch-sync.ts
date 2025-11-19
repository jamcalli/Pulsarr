/**
 * Batch Synchronization Orchestration
 *
 * Handles scheduled batch synchronization of all content using a content-centric approach.
 * Processes all watchlist items and applies labels to Plex content in bulk operations.
 */

import type {
  RadarrMovieWithTags,
  SonarrSeriesWithTags,
  SyncResult,
} from '@root/types/plex-label-sync.types.js'
import type { PlexLabelSyncConfig } from '@schemas/plex/label-sync-config.schema.js'
import type { DatabaseService } from '@services/database.service.js'
import type { PlexServerService } from '@services/plex-server.service.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
import type { SonarrManagerService } from '@services/sonarr-manager.service.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import pLimit from 'p-limit'

import {
  fetchAllRadarrMovies,
  fetchAllSonarrSeries,
  fetchRadarrTagsForItem,
  fetchSonarrTagsForItem,
} from '../data-fetching/index.js'
import { reconcileLabelsForContent as reconcileLabelsUtil } from '../label-operations/index.js'
import { isUserTaggingSystemTag as isUserTaggingSystemTagUtil } from '../label-operations/label-validator.js'
import { resolveContentToPlexItems } from '../matching/index.js'
import { queueUnavailableContent } from '../tracking/queue-manager.js'
import { groupWatchlistItemsByContent } from '../utils/content-grouper.js'

/**
 * Dependencies required for batch synchronization operations
 */
export interface BatchSyncDeps {
  plexServer: PlexServerService
  db: DatabaseService
  logger: FastifyBaseLogger
  config: PlexLabelSyncConfig
  radarrManager: RadarrManagerService
  sonarrManager: SonarrManagerService
  fastify: FastifyInstance
  removedLabelMode: 'remove' | 'keep' | 'special-label'
  removedLabelPrefix: string
  tagPrefix: string
  removedTagPrefix: string
  resetLabels: (
    watchlistItems?: Array<{
      id: string | number
      user_id: number
      guids?: string[] | string
      title: string
      type?: string
      key: string | null
    }>,
  ) => Promise<{ processed: number; updated: number; failed: number }>
  cleanupOrphanedPlexLabels: (
    radarrMovies: RadarrMovieWithTags[],
    sonarrSeries: SonarrSeriesWithTags[],
  ) => Promise<{ removed: number; failed: number }>
}

/**
 * Synchronizes all labels for all content in batch mode using content-centric approach.
 * Each unique content item is processed exactly once with complete user set visibility.
 * Automatically resets dangling labels at the start based on current removal mode.
 *
 * @param deps - Service dependencies
 * @returns Promise resolving to sync results
 */
export async function syncAllLabels(deps: BatchSyncDeps): Promise<SyncResult> {
  deps.logger.info('Starting Plex label synchronization')

  if (!deps.config.enabled) {
    deps.logger.warn(
      {
        enabled: deps.config.enabled,
      },
      'Plex label sync is disabled, skipping',
    )
    return { processed: 0, updated: 0, failed: 0, pending: 0 }
  }

  const operationId = `plex-label-sync-${Date.now()}`
  const emitProgress = deps.fastify.progress.hasActiveConnections()

  const result: SyncResult = {
    processed: 0,
    updated: 0,
    failed: 0,
    pending: 0,
  }

  try {
    if (emitProgress) {
      deps.fastify.progress.emit({
        operationId,
        type: 'plex-label-sync',
        phase: 'start',
        progress: 5,
        message: 'Starting Plex label synchronization...',
      })
    }
    // Reset labels if auto-reset is enabled - this handles dangling entries from mode changes
    if (deps.config.autoResetOnScheduledSync) {
      deps.logger.info(
        {
          currentMode: deps.removedLabelMode,
        },
        'Performing automatic label reset before sync',
      )
      if (emitProgress) {
        deps.fastify.progress.emit({
          operationId,
          type: 'plex-label-sync',
          phase: 'resetting-labels',
          progress: 0,
          message: 'Resetting existing labels based on current removal mode...',
        })
      }

      try {
        await deps.resetLabels()
        if (emitProgress) {
          deps.fastify.progress.emit({
            operationId,
            type: 'plex-label-sync',
            phase: 'reset-complete',
            progress: 15,
            message: 'Reset complete, starting sync...',
          })
        }
        deps.logger.info('Label reset completed successfully')
      } catch (resetError) {
        deps.logger.error({ error: resetError }, 'Error during label reset:')
        // Continue with sync even if reset fails
        if (emitProgress) {
          deps.fastify.progress.emit({
            operationId,
            type: 'plex-label-sync',
            phase: 'reset-failed',
            progress: 15,
            message: 'Reset failed, continuing with sync...',
          })
        }
      }
    }

    deps.logger.debug('Beginning label sync process')

    // Adjust progress based on whether reset was performed
    const baseProgress = deps.config.autoResetOnScheduledSync ? 15 : 0

    // Step 1: Get all active watchlist items from database
    deps.logger.debug('Fetching watchlist items from database...')
    const [movieItems, showItems] = await Promise.all([
      deps.db.getAllMovieWatchlistItems(),
      deps.db.getAllShowWatchlistItems(),
    ])
    const watchlistItems = [...movieItems, ...showItems]

    deps.logger.info(
      {
        movieItemsCount: movieItems.length,
        showItemsCount: showItems.length,
        totalWatchlistItems: watchlistItems.length,
      },
      `Database query results: Found ${movieItems.length} movies and ${showItems.length} shows (${watchlistItems.length} total items)`,
    )

    if (watchlistItems.length === 0) {
      deps.logger.warn(
        'No watchlist items found in database - this might indicate an empty watchlist table',
      )
      if (emitProgress) {
        deps.fastify.progress.emit({
          operationId,
          type: 'plex-label-sync',
          phase: 'complete',
          progress: 100,
          message: 'No content found to label',
        })
      }
      return result
    }

    // Step 2: Fetch tag data from Radarr/Sonarr instances if tag sync is enabled
    let radarrMoviesWithTags: RadarrMovieWithTags[] = []
    let sonarrSeriesWithTags: SonarrSeriesWithTags[] = []

    if (deps.config.tagSync.enabled) {
      if (emitProgress) {
        deps.fastify.progress.emit({
          operationId,
          type: 'plex-label-sync',
          phase: 'fetching-tags',
          progress: baseProgress + 10,
          message: 'Fetching tag data from Radarr/Sonarr instances...',
        })
      }
      deps.logger.debug(
        'Fetching tag data from *arr instances for consolidated processing',
      )

      const [radarrData, sonarrData] = await Promise.all([
        fetchAllRadarrMovies(
          deps.radarrManager,
          deps.config.tagSync.enabled,
          deps.config.tagSync.syncRadarrTags,
          deps.logger,
        ),
        fetchAllSonarrSeries(
          deps.sonarrManager,
          deps.config.tagSync.enabled,
          deps.config.tagSync.syncSonarrTags,
          deps.logger,
        ),
      ])

      radarrMoviesWithTags = radarrData
      sonarrSeriesWithTags = sonarrData

      deps.logger.info(
        {
          radarrMoviesCount: radarrMoviesWithTags.length,
          sonarrSeriesCount: sonarrSeriesWithTags.length,
        },
        'Fetched tag data from *arr instances',
      )
    }

    if (emitProgress) {
      deps.fastify.progress.emit({
        operationId,
        type: 'plex-label-sync',
        phase: 'processing-content',
        progress: baseProgress + 15,
        message: `Grouping ${watchlistItems.length} watchlist items by content...`,
      })
    }

    // Step 3: Group watchlist items by unique content (content-centric approach)
    const contentItems = await groupWatchlistItemsByContent(
      watchlistItems,
      deps.db,
      deps.logger,
    )

    if (contentItems.length === 0) {
      deps.logger.warn('No valid content items found after grouping')
      if (emitProgress) {
        deps.fastify.progress.emit({
          operationId,
          type: 'plex-label-sync',
          phase: 'complete',
          progress: 100,
          message: 'No valid content found to process',
        })
      }
      return result
    }

    if (emitProgress) {
      deps.fastify.progress.emit({
        operationId,
        type: 'plex-label-sync',
        phase: 'processing-content',
        progress: baseProgress + 25,
        message: `Resolving ${contentItems.length} unique content items to Plex items...`,
      })
    }

    // Step 4: Resolve content items to actual Plex items
    const { available, unavailable } = await resolveContentToPlexItems(
      contentItems,
      deps.plexServer,
      deps.logger,
    )

    // Step 5: Queue unavailable content for pending sync
    if (unavailable.length > 0) {
      await queueUnavailableContent(unavailable, {
        db: deps.db,
        logger: deps.logger,
      })
      result.pending = unavailable.reduce(
        (sum, content) => sum + content.users.length,
        0,
      )
    }

    if (available.length === 0) {
      deps.logger.warn('No content available in Plex for processing')
      if (emitProgress) {
        deps.fastify.progress.emit({
          operationId,
          type: 'plex-label-sync',
          phase: 'complete',
          progress: 100,
          message:
            'No content available in Plex - all items queued for pending sync',
        })
      }
      return result
    }

    if (emitProgress) {
      deps.fastify.progress.emit({
        operationId,
        type: 'plex-label-sync',
        phase: 'processing-content',
        progress: baseProgress + 40,
        message: `Processing ${available.length} content items with content-centric reconciliation...`,
      })
    }

    // Step 6: Process available content
    const concurrencyLimit = deps.config.concurrencyLimit || 5
    deps.logger.debug(`Processing ${available.length} content items`)

    const limit = pLimit(concurrencyLimit)
    let processedContentCount = 0

    const contentProcessingResults = await Promise.allSettled(
      available.map((contentItems) =>
        limit(async () => {
          try {
            processedContentCount++

            // Report progress during processing
            if (emitProgress) {
              const processProgress =
                baseProgress +
                40 +
                Math.floor((processedContentCount / available.length) * 50)
              deps.fastify.progress.emit({
                operationId,
                type: 'plex-label-sync',
                phase: 'processing-content',
                progress: processProgress,
                message: `Processing content ${processedContentCount}/${available.length}`,
              })
            }

            // Perform complete label reconciliation for this content (user + tag labels)
            const reconciliationResult = await reconcileLabelsUtil(
              contentItems,
              radarrMoviesWithTags,
              sonarrSeriesWithTags,
              {
                plexServer: deps.plexServer,
                db: deps.db,
                logger: deps.logger,
                config: deps.config,
                removedLabelMode: deps.removedLabelMode,
                removedLabelPrefix: deps.removedLabelPrefix,
                tagPrefix: deps.tagPrefix,
                removedTagPrefix: deps.removedTagPrefix,
              },
            )

            const contentResult = {
              processed: 1, // One unique content item processed
              updated: reconciliationResult.success ? 1 : 0,
              failed: reconciliationResult.success ? 0 : 1,
              pending: 0,
              labelsAdded: reconciliationResult.labelsAdded,
              labelsRemoved: reconciliationResult.labelsRemoved,
            }

            deps.logger.debug(
              {
                primaryGuid: contentItems.content.primaryGuid,
                title: contentItems.content.title,
                userCount: contentItems.content.users.length,
                plexItemCount: contentItems.plexItems.length,
                success: reconciliationResult.success,
                labelsAdded: reconciliationResult.labelsAdded,
                labelsRemoved: reconciliationResult.labelsRemoved,
              },
              'Content-centric processing completed',
            )

            return contentResult
          } catch (error) {
            deps.logger.error(
              {
                error,
                primaryGuid: contentItems.content.primaryGuid,
                title: contentItems.content.title,
              },
              `Error processing content ${contentItems.content.primaryGuid} (${contentItems.content.title})`,
            )
            return {
              processed: 1,
              updated: 0,
              failed: 1,
              pending: 0,
              labelsAdded: 0,
              labelsRemoved: 0,
            }
          }
        }),
      ),
    )

    // Step 7: Aggregate results
    let totalLabelsAdded = 0
    let totalLabelsRemoved = 0

    for (const promiseResult of contentProcessingResults) {
      if (promiseResult.status === 'fulfilled') {
        const contentResult = promiseResult.value
        result.processed += contentResult.processed
        result.updated += contentResult.updated
        result.failed += contentResult.failed
        result.pending += contentResult.pending
        totalLabelsAdded += contentResult.labelsAdded || 0
        totalLabelsRemoved += contentResult.labelsRemoved || 0
      } else {
        deps.logger.error(
          { error: promiseResult.reason },
          'Error processing content item:',
        )
        result.failed++
      }
    }

    // Get accurate pending count from database
    const pendingSyncs = await deps.db.getPendingLabelSyncs()
    result.pending = pendingSyncs.length

    deps.logger.info(
      {
        totalLabelsAdded,
        totalLabelsRemoved,
      },
      `Processed ${result.processed} content items: ${result.updated} updated, ${result.failed} failed, ${result.pending} pending`,
    )

    // Step 8: Handle orphaned label cleanup if enabled
    let cleanupMessage = ''
    if (deps.config.cleanupOrphanedLabels) {
      try {
        if (emitProgress) {
          deps.fastify.progress.emit({
            operationId,
            type: 'plex-label-sync',
            phase: 'cleanup',
            progress: baseProgress + 95,
            message: 'Cleaning up orphaned Plex labels...',
          })
        }
        const cleanupResult = await deps.cleanupOrphanedPlexLabels(
          radarrMoviesWithTags,
          sonarrSeriesWithTags,
        )
        if (cleanupResult.removed > 0 || cleanupResult.failed > 0) {
          cleanupMessage = `, cleaned up ${cleanupResult.removed} orphaned labels (${cleanupResult.failed} failed)`
          deps.logger.info(
            cleanupResult,
            'Completed orphaned Plex label cleanup',
          )
        }
      } catch (cleanupError) {
        deps.logger.error(
          { error: cleanupError },
          'Error during orphaned label cleanup:',
        )
        cleanupMessage = ', orphaned cleanup failed'
      }
    }

    deps.logger.info(
      {
        ...result,
        totalLabelsAdded,
        totalLabelsRemoved,
      },
      'Plex label synchronization completed',
    )

    if (emitProgress) {
      deps.fastify.progress.emit({
        operationId,
        type: 'plex-label-sync',
        phase: 'complete',
        progress: 100,
        message: `Completed Plex label sync: updated ${result.updated} items, failed ${result.failed}, pending ${result.pending}${cleanupMessage}`,
      })
    }

    return result
  } catch (error) {
    deps.logger.error(
      { error },
      'Error in content-centric batch label synchronization',
    )

    if (emitProgress) {
      deps.fastify.progress.emit({
        operationId,
        type: 'plex-label-sync',
        phase: 'error',
        progress: 100,
        message: `Error syncing Plex labels: ${error}`,
      })
    }

    throw error
  }
}

/**
 * Fetches tags for a specific watchlist item from the appropriate *arr instances
 * using targeted API calls instead of fetching all content from all instances.
 *
 * @param watchlistItem - The watchlist item with GUID and content info
 * @param deps - Service dependencies
 * @returns Array of tags found for this content, or empty array if no match
 */
export async function fetchTagsForWatchlistItem(
  watchlistItem: {
    id: string | number
    title: string
    key: string | null
    type?: string
    guids?: string[]
    tmdbId?: number
    tvdbId?: number
  },
  deps: BatchSyncDeps,
): Promise<string[]> {
  if (!deps.config.tagSync.enabled) {
    return []
  }

  try {
    const contentType = watchlistItem.type || 'movie'

    deps.logger.debug(
      {
        itemId: watchlistItem.id,
        title: watchlistItem.title,
        contentType,
        tmdbId: watchlistItem.tmdbId,
        tvdbId: watchlistItem.tvdbId,
      },
      'Fetching tags for watchlist item using all-instances approach',
    )

    let tags: string[] = []

    if (contentType === 'movie' && deps.config.tagSync.syncRadarrTags) {
      // Get ALL Radarr instances like the main workflow does
      const allRadarrInstances = await deps.radarrManager.getAllInstances()
      const allInstanceIds = allRadarrInstances.map((instance) => instance.id)

      if (allInstanceIds.length > 0 && watchlistItem.tmdbId) {
        tags = await fetchRadarrTagsForItem(
          deps.radarrManager,
          allInstanceIds,
          watchlistItem.tmdbId,
          watchlistItem.title,
          (tag) =>
            isUserTaggingSystemTagUtil(
              tag,
              deps.tagPrefix,
              deps.removedTagPrefix,
            ),
          deps.logger,
        )
      }
    } else if (contentType === 'show' && deps.config.tagSync.syncSonarrTags) {
      // Get ALL Sonarr instances like the main workflow does
      const allSonarrInstances = await deps.sonarrManager.getAllInstances()
      const allInstanceIds = allSonarrInstances.map((instance) => instance.id)

      if (allInstanceIds.length > 0 && watchlistItem.tvdbId) {
        tags = await fetchSonarrTagsForItem(
          deps.sonarrManager,
          allInstanceIds,
          watchlistItem.tvdbId,
          watchlistItem.title,
          (tag) =>
            isUserTaggingSystemTagUtil(
              tag,
              deps.tagPrefix,
              deps.removedTagPrefix,
            ),
          deps.logger,
        )
      }
    }

    deps.logger.debug(
      {
        itemId: watchlistItem.id,
        title: watchlistItem.title,
        tagsFound: tags.length,
        tags,
      },
      'Successfully fetched tags using targeted approach',
    )

    return tags
  } catch (error) {
    deps.logger.error(
      {
        error,
        itemId: watchlistItem.id,
        title: watchlistItem.title,
      },
      'Error fetching tags for watchlist item',
    )
    return []
  }
}
