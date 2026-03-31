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
import { buildPlexGuid } from '@utils/guid-handler.js'
import type { FastifyBaseLogger } from 'fastify'
import pLimit from 'p-limit'

import {
  buildReconcilerDeps,
  reconcileLabelsForSingleItem,
} from '../label-operations/index.js'
import { computeDesiredTagLabels } from '../label-operations/label-validator.js'
import {
  createDbGuidResolver,
  trackLabelsForUsers,
} from '../tracking/content-tracker.js'

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
    const pendingSyncs: PendingLabelSyncWithPlexKeys[] =
      await deps.db.getPendingLabelSyncsWithPlexKeys()

    // Pre-fetch all users for performance
    const allUsers = await deps.db.getAllUsers()
    const userMap = new Map(allUsers.map((user) => [user.id, user]))

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

            if (!pendingSync.plex_key) {
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

            const user = userMap.get(pendingSync.user_id)

            if (!user) {
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

            const contentType = pendingSync.type || 'movie'

            const fullGuid = buildPlexGuid(
              contentType === 'show' ? 'show' : 'movie',
              pendingSync.plex_key,
            )

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

            const plexItems = await deps.plexServer.searchByGuid(fullGuid)

            if (plexItems.length === 0) {
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

            // Gather all users for this content from tracking table + current user
            const primaryRatingKey = plexItems[0].ratingKey
            const trackedLabels =
              await deps.db.getTrackedLabelsForRatingKey(primaryRatingKey)

            const trackedUsers = new Map<
              number,
              { user_id: number; username: string; watchlist_id: number }
            >()

            for (const tracking of trackedLabels) {
              if (
                tracking.user_id !== null &&
                !trackedUsers.has(tracking.user_id)
              ) {
                const trackedUser = userMap.get(tracking.user_id)
                if (trackedUser) {
                  trackedUsers.set(tracking.user_id, {
                    user_id: trackedUser.id,
                    username: trackedUser.name || `user_${trackedUser.id}`,
                    watchlist_id: 0,
                  })
                }
              }
            }

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

            // Compute desired labels
            const desiredUserLabels = allUsersForContent.map(
              (u) => `${deps.config.labelPrefix}:${u.username}`,
            )

            const desiredTagLabels = computeDesiredTagLabels(
              pendingSync.webhook_tags || [],
              contentType,
              deps.config.tagSync,
              deps.tagPrefix,
              deps.removedTagPrefix,
              deps.config.labelPrefix,
            )

            const allDesiredLabels = [...desiredUserLabels, ...desiredTagLabels]

            deps.logger.debug(
              {
                ratingKey: primaryRatingKey,
                title: pendingSync.content_title,
                totalUsers: allUsersForContent.length,
                usernames: allUsersForContent.map((u) => u.username),
              },
              'Found all users for pending sync',
            )

            // Reconcile labels for all Plex items
            const reconcilerDeps = buildReconcilerDeps(deps)
            const contentTypeToUse: 'movie' | 'show' =
              contentType === 'show' ? 'show' : 'movie'

            let allSuccessful = true
            for (const plexItem of plexItems) {
              const reconcileResult = await reconcileLabelsForSingleItem(
                plexItem.ratingKey,
                allDesiredLabels,
                desiredUserLabels,
                desiredTagLabels,
                pendingSync.content_title,
                reconcilerDeps,
              )

              if (!reconcileResult.success) {
                allSuccessful = false
                continue
              }

              await trackLabelsForUsers({
                ratingKey: plexItem.ratingKey,
                users: allUsersForContent,
                getGuidsForUser: createDbGuidResolver(
                  deps.db,
                  plexItem.ratingKey,
                ),
                tagLabels: desiredTagLabels,
                contentType: contentTypeToUse,
                labelPrefix: deps.config.labelPrefix,
                db: deps.db,
                logger: deps.logger,
              })
            }

            if (allSuccessful) {
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
                  usernames: allUsersForContent.map((u) => u.username),
                },
                'Successfully processed pending sync',
              )
            } else {
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

    const expiredCount = await deps.db.expirePendingLabelSyncs()

    if (expiredCount > 0) {
      deps.logger.info(`Cleaned up ${expiredCount} expired pending syncs`)
    }

    return result
  } catch (error) {
    deps.logger.error({ error }, 'Error processing pending label syncs:')
    throw error
  }
}
