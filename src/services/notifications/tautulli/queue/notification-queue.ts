/**
 * Tautulli Notification Queue
 *
 * Manages the pending notification queue state and operations.
 */

import type {
  PendingNotification,
  TautulliNotifier,
} from '@root/types/tautulli.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { normalizeGuid } from '@utils/guid-handler.js'
import type { FastifyBaseLogger } from 'fastify'
import type {
  FindMatchingItemFn,
  GetRecentlyAddedFn,
} from '../matching/index.js'
import type { NotifierManagerDeps } from '../notifiers/index.js'
import {
  ensureUserNotifier,
  type TautulliEnabledUser,
} from '../notifiers/index.js'

// Queue constants
export const POLL_INTERVAL_MS = 30000 // 30 seconds
export const MAX_ATTEMPTS = 20 // 10 minutes total with 30s intervals
export const MAX_AGE_MS = 1800000 // 30 minutes max age

export interface QueueDeps {
  log: FastifyBaseLogger
  db: DatabaseService
  isActive: () => boolean
  getNotifiers: () => Promise<TautulliNotifier[]>
  notifierDeps: NotifierManagerDeps
  findMatchingItem: FindMatchingItemFn
  getRecentlyAdded: GetRecentlyAddedFn
  sendTautulliNotification: (
    notifierId: number,
    ratingKey: string,
  ) => Promise<boolean>
  startPolling: () => void
}

/**
 * Generate a unique key for a notification
 */
export function generateNotificationKey(
  guid: string,
  metadata: { seasonNumber?: number; episodeNumber?: number },
): string {
  let key = guid
  if (metadata.seasonNumber !== undefined) {
    key += `:S${metadata.seasonNumber}`
  }
  if (metadata.episodeNumber !== undefined) {
    key += `E${metadata.episodeNumber}`
  }
  return key
}

/**
 * Queue a notification to be sent when content appears in Tautulli
 */
export async function queueNotification(
  pendingNotifications: Map<string, PendingNotification>,
  guid: string,
  mediaType: 'movie' | 'show' | 'episode',
  interestedUsers: Array<{
    userId: number
    username: string
    notifierId: number
  }>,
  metadata: {
    title: string
    watchlistItemId: number
    watchlistItemKey?: string
    seasonNumber?: number
    episodeNumber?: number
  },
  deps: QueueDeps,
): Promise<void> {
  const {
    log,
    db,
    isActive,
    getNotifiers,
    notifierDeps,
    findMatchingItem,
    getRecentlyAdded,
    sendTautulliNotification,
    startPolling,
  } = deps

  if (!isActive() || interestedUsers.length === 0) {
    return
  }

  // Filter out users without valid notifier IDs and create notifiers for them
  const validUsers: Array<{
    userId: number
    username: string
    notifierId: number
  }> = []

  // Get existing notifiers once
  const existingNotifiers = await getNotifiers()

  for (const user of interestedUsers) {
    // Check if user has a notifier ID and if it actually exists in Tautulli
    const hasValidNotifierId = user.notifierId && user.notifierId !== 0
    const notifierExists =
      hasValidNotifierId &&
      existingNotifiers.some((n) => n.id === user.notifierId)

    if (!hasValidNotifierId || !notifierExists) {
      if (hasValidNotifierId && !notifierExists) {
        log.warn(
          { user: user.username, invalidNotifierId: user.notifierId },
          'User has invalid Tautulli notifier ID - will create new one',
        )
        // Clear the invalid notifier ID from the database
        await db.updateUser(user.userId, { tautulli_notifier_id: null })
      }
      log.info(
        { user: user.username },
        'User has no Tautulli notifier for queueing, creating one now',
      )

      try {
        const tautulliUser: TautulliEnabledUser = {
          id: user.userId,
          username: user.username,
          tautulli_notifier_id: null,
        }

        const notifierId = await ensureUserNotifier(
          tautulliUser,
          existingNotifiers,
          notifierDeps,
        )

        if (notifierId) {
          validUsers.push({
            ...user,
            notifierId,
          })
          log.info(
            { user: user.username, notifierId },
            'Created Tautulli notifier for user',
          )

          // Give Tautulli a moment to process the new agent before using it
          await new Promise((resolve) => setTimeout(resolve, 2000))
        } else {
          log.warn(
            { user: user.username },
            'Failed to create Tautulli notifier for user - ensureUserNotifier returned null, skipping notification',
          )
        }
      } catch (error) {
        log.error(
          {
            error: error instanceof Error ? error.message : error,
            user: user.username,
          },
          'Error creating Tautulli notifier for user',
        )
      }
    } else {
      validUsers.push(user)
    }
  }

  if (validUsers.length === 0) {
    log.warn(
      'No valid users with Tautulli notifiers after filtering, skipping notification queue',
    )
    return
  }

  // Try immediate notification first for users with newly created agents
  const immediateResults: Array<{ username: string; success: boolean }> = []
  const usersNeedingQueue: typeof validUsers = []

  // Fetch once to avoid N calls
  const recentItems50 = await getRecentlyAdded(50)
  const normalizedGuid = normalizeGuid(guid)

  for (const user of validUsers) {
    // Try to find the content immediately in Tautulli's recently added
    try {
      const mockNotification: PendingNotification = {
        guid: normalizedGuid,
        mediaType,
        watchlistItemId: metadata.watchlistItemId,
        watchlistItemKey: metadata.watchlistItemKey,
        interestedUsers: [user],
        title: metadata.title,
        seasonNumber: metadata.seasonNumber,
        episodeNumber: metadata.episodeNumber,
        addedAt: Date.now(),
        attempts: 1,
        maxAttempts: MAX_ATTEMPTS,
      }

      const matchingItem = await findMatchingItem(
        mockNotification,
        recentItems50,
      )

      if (matchingItem) {
        log.debug(
          { user: user.username, title: metadata.title },
          'Found content immediately after agent creation, sending notification now',
        )

        const success = await sendTautulliNotification(
          user.notifierId,
          matchingItem.rating_key,
        )

        immediateResults.push({ username: user.username, success })

        if (success) {
          log.debug(
            { user: user.username, title: metadata.title },
            'Successfully sent immediate Tautulli notification after agent creation',
          )
          continue // Don't queue this user
        }
      }
    } catch (error) {
      log.debug(
        { error, user: user.username },
        'Failed immediate notification attempt, will queue instead',
      )
    }

    // If immediate notification failed or content not found, queue for polling
    usersNeedingQueue.push(user)
  }

  // If all users were handled immediately, we're done
  if (usersNeedingQueue.length === 0) {
    log.debug(
      {
        title: metadata.title,
        immediateSuccesses: immediateResults.filter((r) => r.success).length,
        immediateFails: immediateResults.filter((r) => !r.success).length,
      },
      'All Tautulli notifications sent immediately, no queuing needed',
    )
    return
  }

  // Queue remaining users who need polling
  const key = generateNotificationKey(normalizedGuid, metadata)

  // Check if we already have this notification queued
  const existing = pendingNotifications.get(key)
  if (existing) {
    // Add any new users to the existing notification
    for (const user of usersNeedingQueue) {
      if (!existing.interestedUsers.some((u) => u.userId === user.userId)) {
        existing.interestedUsers.push(user)
      }
    }
    log.debug(
      { key, userCount: existing.interestedUsers.length },
      'Updated existing queued notification with new users',
    )
    return
  }

  const notification: PendingNotification = {
    guid: normalizedGuid,
    mediaType,
    watchlistItemId: metadata.watchlistItemId,
    watchlistItemKey: metadata.watchlistItemKey,
    interestedUsers: usersNeedingQueue,
    title: metadata.title,
    seasonNumber: metadata.seasonNumber,
    episodeNumber: metadata.episodeNumber,
    addedAt: Date.now(),
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
  }

  pendingNotifications.set(key, notification)

  log.info(
    {
      guid: normalizedGuid,
      mediaType,
      title: metadata.title,
      users: usersNeedingQueue.map((u) => u.username),
      seasonNumber: metadata.seasonNumber,
      episodeNumber: metadata.episodeNumber,
      immediateNotifications: immediateResults.length,
    },
    'Queued Tautulli notification for remaining users',
  )

  // Start polling if not already running
  startPolling()
}

/**
 * Clean up expired notifications from the queue
 */
export function cleanupExpiredNotifications(
  pendingNotifications: Map<string, PendingNotification>,
  log: FastifyBaseLogger,
): void {
  const now = Date.now()
  let removed = 0
  const totalPending = pendingNotifications.size

  for (const [key, notification] of pendingNotifications) {
    if (now - notification.addedAt > MAX_AGE_MS) {
      pendingNotifications.delete(key)
      removed++
      log.warn(
        {
          title: notification.title,
          guid: notification.guid,
          ageMs: now - notification.addedAt,
          attempts: notification.attempts,
        },
        'Removed expired Tautulli notification from queue',
      )
    }
  }

  if (removed > 0) {
    log.info(
      {
        count: removed,
        totalPending,
        remaining: pendingNotifications.size,
      },
      'Cleaned up expired Tautulli notifications',
    )
  }

  // Alert if queue is growing too large
  if (pendingNotifications.size > 100) {
    log.warn(
      { queueSize: pendingNotifications.size },
      'Tautulli notification queue is growing large - check for processing issues',
    )
  }
}
