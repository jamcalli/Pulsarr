/**
 * Pending Synchronization Orchestration
 *
 * Handles processing of pending label syncs for content that wasn't available in Plex
 * when the initial sync attempt was made. Groups by content to avoid race conditions
 * when multiple users queue the same content.
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
 * Groups pending syncs by content identity (type + plex_key) so each unique
 * content is processed exactly once with the full set of pending users.
 * Prevents race conditions where concurrent processing of the same content
 * causes last-writer-wins label loss.
 */
function groupPendingSyncsByContent(
  pendingSyncs: PendingLabelSyncWithPlexKeys[],
): Map<
  string,
  {
    contentType: string
    plexKey: string
    title: string
    webhookTags: string[]
    rows: PendingLabelSyncWithPlexKeys[]
  }
> {
  const groups = new Map<
    string,
    {
      contentType: string
      plexKey: string
      title: string
      webhookTags: string[]
      rows: PendingLabelSyncWithPlexKeys[]
    }
  >()

  for (const sync of pendingSyncs) {
    if (!sync.plex_key) {
      // No key yet - these get handled individually below
      const soloKey = `no-key-${sync.id}`
      groups.set(soloKey, {
        contentType: sync.type || 'movie',
        plexKey: '',
        title: sync.content_title,
        webhookTags: sync.webhook_tags || [],
        rows: [sync],
      })
      continue
    }

    const groupKey = `${sync.type || 'movie'}:${sync.plex_key}`
    const existing = groups.get(groupKey)

    if (existing) {
      existing.rows.push(sync)
      // Merge tags from all rows for this content
      if (sync.webhook_tags?.length) {
        for (const tag of sync.webhook_tags) {
          if (!existing.webhookTags.includes(tag)) {
            existing.webhookTags.push(tag)
          }
        }
      }
    } else {
      groups.set(groupKey, {
        contentType: sync.type || 'movie',
        plexKey: sync.plex_key,
        title: sync.content_title,
        webhookTags: [...(sync.webhook_tags || [])],
        rows: [sync],
      })
    }
  }

  return groups
}

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

    const allUsers = await deps.db.getAllUsers()
    const userMap = new Map(allUsers.map((user) => [user.id, user]))

    const contentGroups = groupPendingSyncsByContent(pendingSyncs)

    const concurrencyLimit = deps.config.concurrencyLimit || 5
    const limit = pLimit(concurrencyLimit)

    const groupResults = await Promise.allSettled(
      Array.from(contentGroups.values()).map((group) =>
        limit(async () => {
          const syncResult = {
            processed: 0,
            updated: 0,
            failed: 0,
            pending: 0,
          }

          try {
            syncResult.processed++

            // No plex key yet - retry all rows in this group
            if (!group.plexKey) {
              for (const row of group.rows) {
                await deps.db.updatePendingLabelSyncRetry(row.id)
              }
              syncResult.pending++
              deps.logger.debug(
                {
                  title: group.title,
                  rowCount: group.rows.length,
                },
                'Pending sync still missing GUID part',
              )
              return syncResult
            }

            // Validate all users in the group still exist
            const validRows = group.rows.filter((row) => {
              const user = userMap.get(row.user_id)
              if (!user) {
                void deps.db.deletePendingLabelSync(row.id)
                deps.logger.debug(
                  { userId: row.user_id, title: row.content_title },
                  'User not found for pending sync, removing from queue',
                )
                return false
              }
              return true
            })

            if (validRows.length === 0) {
              return syncResult
            }

            const contentType = group.contentType
            const fullGuid = buildPlexGuid(
              contentType === 'show' ? 'show' : 'movie',
              group.plexKey,
            )

            deps.logger.debug(
              {
                title: group.title,
                guidPart: group.plexKey,
                fullGuid,
                contentType,
                pendingUsers: validRows.length,
              },
              'Resolving GUID to rating key for pending sync group',
            )

            const plexItems = await deps.plexServer.searchByGuid(fullGuid)

            if (plexItems.length === 0) {
              for (const row of validRows) {
                await deps.db.updatePendingLabelSyncRetry(row.id)
              }
              syncResult.pending++
              deps.logger.debug(
                { title: group.title, guid: fullGuid },
                'Content still not found in Plex library for pending sync',
              )
              return syncResult
            }

            // Gather all users: tracked (existing) + all pending rows in this group
            const primaryRatingKey = plexItems[0].ratingKey
            const trackedLabels =
              await deps.db.getTrackedLabelsForRatingKey(primaryRatingKey)

            const allContentUsers = new Map<
              number,
              { user_id: number; username: string; watchlist_id: number }
            >()

            const trackedGuids = new Map<number, string[]>()

            for (const tracking of trackedLabels) {
              if (
                tracking.user_id !== null &&
                !allContentUsers.has(tracking.user_id)
              ) {
                const trackedUser = userMap.get(tracking.user_id)
                if (trackedUser) {
                  allContentUsers.set(tracking.user_id, {
                    user_id: trackedUser.id,
                    username: trackedUser.name || `user_${trackedUser.id}`,
                    watchlist_id: 0,
                  })
                  if (tracking.content_guids.length > 0) {
                    trackedGuids.set(tracking.user_id, tracking.content_guids)
                  }
                }
              }
            }

            // Add all pending users from this group
            for (const row of validRows) {
              if (!allContentUsers.has(row.user_id)) {
                const pendingUser = userMap.get(row.user_id)
                if (pendingUser) {
                  allContentUsers.set(row.user_id, {
                    user_id: pendingUser.id,
                    username: pendingUser.name || `user_${pendingUser.id}`,
                    watchlist_id: row.watchlist_item_id,
                  })
                }
              }
            }

            const usersForContent = Array.from(allContentUsers.values())

            const desiredUserLabels = usersForContent.map(
              (u) => `${deps.config.labelPrefix}:${u.username}`,
            )

            const desiredTagLabels = computeDesiredTagLabels(
              group.webhookTags,
              contentType,
              deps.config.tagSync,
              deps.tagPrefix,
              deps.removedTagPrefix,
              deps.config.labelPrefix,
            )

            deps.logger.debug(
              {
                ratingKey: primaryRatingKey,
                title: group.title,
                totalUsers: usersForContent.length,
                usernames: usersForContent.map((u) => u.username),
              },
              'Found all users for pending sync group',
            )

            const reconcilerDeps = buildReconcilerDeps(deps)
            const contentTypeToUse: 'movie' | 'show' =
              contentType === 'show' ? 'show' : 'movie'

            let allSuccessful = true
            for (const plexItem of plexItems) {
              const reconcileResult = await reconcileLabelsForSingleItem(
                plexItem.ratingKey,
                desiredUserLabels,
                desiredTagLabels,
                group.title,
                reconcilerDeps,
              )

              if (!reconcileResult.success) {
                allSuccessful = false
                continue
              }

              const dbResolver = createDbGuidResolver(
                deps.db,
                plexItem.ratingKey,
              )

              await trackLabelsForUsers({
                ratingKey: plexItem.ratingKey,
                users: usersForContent,
                getGuidsForUser: async (user) => {
                  const existing = trackedGuids.get(user.user_id)
                  if (existing) return existing
                  return dbResolver(user)
                },
                tagLabels: desiredTagLabels,
                contentType: contentTypeToUse,
                labelPrefix: deps.config.labelPrefix,
                db: deps.db,
                logger: deps.logger,
              })
            }

            if (allSuccessful) {
              for (const row of validRows) {
                await deps.db.deletePendingLabelSync(row.id)
              }
              syncResult.updated++
              deps.logger.debug(
                {
                  title: group.title,
                  guidPart: group.plexKey,
                  fullGuid,
                  plexItemsFound: plexItems.length,
                  ratingKeys: plexItems.map((item) => item.ratingKey),
                  usernames: usersForContent.map((u) => u.username),
                  rowsCleared: validRows.length,
                },
                'Successfully processed pending sync group',
              )
            } else {
              for (const row of validRows) {
                await deps.db.updatePendingLabelSyncRetry(row.id)
              }
              syncResult.failed++
            }
          } catch (error) {
            deps.logger.error(
              {
                error,
                title: group.title,
                rowCount: group.rows.length,
              },
              `Error processing pending sync group for "${group.title}"`,
            )
            for (const row of group.rows) {
              await deps.db.updatePendingLabelSyncRetry(row.id)
            }
            syncResult.failed++
          }

          return syncResult
        }),
      ),
    )

    for (const promiseResult of groupResults) {
      if (promiseResult.status === 'fulfilled') {
        const syncResult = promiseResult.value
        result.processed += syncResult.processed
        result.updated += syncResult.updated
        result.failed += syncResult.failed
        result.pending += syncResult.pending
      } else {
        deps.logger.error(
          { error: promiseResult.reason },
          'Error processing pending sync group:',
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
