/**
 * Pending Synchronization Orchestration
 *
 * Handles processing of pending label syncs for content that wasn't available in Plex
 * when the initial sync attempt was made. Retries syncs with exponential backoff.
 */

import type { SyncResult } from '@root/types/plex-label-sync.types.js'
import type { PlexLabelSyncConfig } from '@schemas/plex/label-sync-config.schema.js'
import type { PendingLabelSyncWithPlexKeys } from '@services/database/methods/plex-label-sync.js'
import type { DatabaseService } from '@services/database.service.js'
import type { PlexServerService } from '@services/plex-server.service.js'
import type { FastifyBaseLogger } from 'fastify'
import pLimit from 'p-limit'

import { applyLabelsToSingleItem as applyLabelsUtil } from '../label-operations/index.js'

/**
 * Dependencies required for pending synchronization operations
 */
export interface PendingSyncDeps {
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
 * Processes pending label syncs for content that wasn't available in Plex
 * during the initial sync attempt. Uses content-centric approach to ensure
 * all users are included when content becomes available.
 *
 * @param deps - Service dependencies
 * @returns Promise resolving to sync results
 */
export async function processPendingLabelSyncs(
  deps: PendingSyncDeps,
): Promise<SyncResult> {
  if (!deps.config.enabled) {
    return { processed: 0, updated: 0, failed: 0, pending: 0 }
  }

  const result: SyncResult = {
    processed: 0,
    updated: 0,
    failed: 0,
    pending: 0,
  }

  try {
    // Get pending syncs with their watchlist items and Plex keys
    const pendingSyncs: PendingLabelSyncWithPlexKeys[] =
      await deps.db.getPendingLabelSyncsWithPlexKeys()

    // Process silently - completion will be logged by the processor service if items were updated

    // Process pending syncs in parallel with configurable concurrency limit
    const concurrencyLimit = deps.config.concurrencyLimit || 5
    const limit = pLimit(concurrencyLimit)

    const pendingProcessingResults = await Promise.allSettled(
      pendingSyncs.map((pendingSync) =>
        limit(async () => {
          const syncResult = {
            processed: 0,
            updated: 0,
            failed: 0,
            pending: 0,
          }

          try {
            syncResult.processed++

            // Check if watchlist item has GUID part now
            if (!pendingSync.plex_key) {
              // Update retry count
              await deps.db.updatePendingLabelSyncRetry(pendingSync.id)
              syncResult.pending++
              deps.logger.debug(
                {
                  watchlistItemId: pendingSync.watchlist_item_id,
                  title: pendingSync.content_title,
                },
                'Pending sync still missing GUID part',
              )
              return syncResult
            }

            // Get user information
            const user = await deps.db
              .knex('users')
              .where('id', pendingSync.user_id)
              .select('id', 'name')
              .first()

            if (!user) {
              // Remove from pending queue if user doesn't exist
              await deps.db.deletePendingLabelSync(pendingSync.id)
              deps.logger.debug(
                {
                  userId: pendingSync.user_id,
                  title: pendingSync.content_title,
                },
                'User not found for pending sync, removing from queue',
              )
              return syncResult
            }

            const username = user.name || `user_${user.id}`

            // The plex_key contains a GUID part, need to resolve to rating key
            let fullGuid: string
            const contentType = pendingSync.type || 'movie'

            if (contentType === 'show') {
              fullGuid = `plex://show/${pendingSync.plex_key}`
            } else {
              fullGuid = `plex://movie/${pendingSync.plex_key}`
            }

            deps.logger.debug(
              {
                watchlistItemId: pendingSync.watchlist_item_id,
                title: pendingSync.content_title,
                guidPart: pendingSync.plex_key,
                fullGuid,
                contentType,
              },
              'Resolving GUID to rating key for pending sync',
            )

            // Search for the content in Plex using the full GUID
            const plexItems = await deps.plexServer.searchByGuid(fullGuid)

            if (plexItems.length === 0) {
              // Content not found yet, update retry count and keep pending
              await deps.db.updatePendingLabelSyncRetry(pendingSync.id)
              syncResult.pending++
              deps.logger.debug(
                {
                  watchlistItemId: pendingSync.watchlist_item_id,
                  title: pendingSync.content_title,
                  guid: fullGuid,
                },
                'Content still not found in Plex library for pending sync',
              )
              return syncResult
            }

            // Use tracking table as source of truth for all users who should have labels
            // This ensures consistency with "keep" and "special-label" removal modes
            const primaryRatingKey = plexItems[0].ratingKey

            // Get all tracked labels for this content from the tracking table
            const trackedLabels =
              await deps.db.getTrackedLabelsForRatingKey(primaryRatingKey)

            // Build user list from tracking records (existing labels)
            const trackedUsers = new Map<
              number,
              { user_id: number; username: string; watchlist_id: number }
            >()
            const allUsers = await deps.db.getAllUsers()
            const userMap = new Map(allUsers.map((user) => [user.id, user]))

            // Add users from existing tracking records
            for (const tracking of trackedLabels) {
              // Skip system tracking records (null user_id)
              if (
                tracking.user_id !== null &&
                !trackedUsers.has(tracking.user_id)
              ) {
                const trackedUser = userMap.get(tracking.user_id)
                if (trackedUser) {
                  trackedUsers.set(tracking.user_id, {
                    user_id: trackedUser.id,
                    username: trackedUser.name || `user_${trackedUser.id}`,
                    watchlist_id: 0, // Not used in content-based tracking
                  })
                }
              }
            }

            // Add the new user from the pending sync if not already tracked
            if (!trackedUsers.has(pendingSync.user_id)) {
              const newUser = userMap.get(pendingSync.user_id)
              if (newUser) {
                trackedUsers.set(pendingSync.user_id, {
                  user_id: newUser.id,
                  username: newUser.name || `user_${newUser.id}`,
                  watchlist_id: pendingSync.watchlist_item_id,
                })
              }
            }

            const allUsersForContent = Array.from(trackedUsers.values())

            deps.logger.debug(
              {
                ratingKey: primaryRatingKey,
                contentKey: pendingSync.plex_key,
                title: pendingSync.content_title,
                existingTrackedLabels: trackedLabels.length,
                totalUsers: allUsersForContent.length,
                usernames: allUsersForContent.map((u) => u.username),
                approach: 'tracking-table-based',
              },
              'Found all users for pending sync using tracking table',
            )

            // Apply labels to all found items for ALL users (content-centric approach)
            let allSuccessful = true
            for (const plexItem of plexItems) {
              const success = await applyLabelsUtil(
                plexItem.ratingKey,
                allUsersForContent, // Pass ALL users instead of just one
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
                pendingSync.webhook_tags,
                pendingSync.type || 'movie',
              )

              if (!success) {
                allSuccessful = false
              }
            }

            const success = allSuccessful

            if (success) {
              // Remove from pending queue
              await deps.db.deletePendingLabelSync(pendingSync.id)

              syncResult.updated++
              deps.logger.debug(
                {
                  watchlistItemId: pendingSync.watchlist_item_id,
                  title: pendingSync.content_title,
                  guidPart: pendingSync.plex_key,
                  fullGuid,
                  plexItemsFound: plexItems.length,
                  ratingKeys: plexItems.map((item) => item.ratingKey),
                  username,
                },
                'Successfully processed pending sync',
              )
            } else {
              // Update retry count for failed attempts
              await deps.db.updatePendingLabelSyncRetry(pendingSync.id)
              syncResult.failed++
            }
          } catch (error) {
            deps.logger.error(
              {
                error,
                watchlistItemId: pendingSync.watchlist_item_id,
                title: pendingSync.content_title,
              },
              `Error processing pending sync for watchlist item ${pendingSync.watchlist_item_id} (${pendingSync.content_title})`,
            )
            // Update retry count for errors
            await deps.db.updatePendingLabelSyncRetry(pendingSync.id)
            syncResult.failed++
          }

          return syncResult
        }),
      ),
    )

    // Aggregate results
    for (const promiseResult of pendingProcessingResults) {
      if (promiseResult.status === 'fulfilled') {
        const syncResult = promiseResult.value
        result.processed += syncResult.processed
        result.updated += syncResult.updated
        result.failed += syncResult.failed
        result.pending += syncResult.pending
      } else {
        deps.logger.error(
          { error: promiseResult.reason },
          'Error processing pending sync:',
        )
        result.failed++
      }
    }

    // Clean up expired pending syncs
    const expiredCount = await deps.db.expirePendingLabelSyncs()

    if (expiredCount > 0) {
      deps.logger.info(`Cleaned up ${expiredCount} expired pending syncs`)
    }

    // Completion will be logged by the processor service with more details
    return result
  } catch (error) {
    deps.logger.error({ error }, 'Error processing pending label syncs:')
    throw error
  }
}
