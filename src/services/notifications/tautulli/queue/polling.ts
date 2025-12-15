/**
 * Tautulli Notification Polling
 *
 * Handles the polling lifecycle for pending notifications.
 */

import type {
  PendingNotification,
  RecentlyAddedItem,
} from '@root/types/tautulli.types.js'
import type { FastifyBaseLogger } from 'fastify'
import type {
  FindMatchingItemFn,
  GetRecentlyAddedFn,
} from '../matching/index.js'
import {
  cleanupExpiredNotifications,
  POLL_INTERVAL_MS,
} from './notification-queue.js'

export interface PollingState {
  pollInterval: NodeJS.Timeout | null
  isPolling: boolean
}

export interface PollingDeps {
  log: FastifyBaseLogger
  isActive: () => boolean
  pendingNotifications: Map<string, PendingNotification>
  findMatchingItem: FindMatchingItemFn
  getRecentlyAdded: GetRecentlyAddedFn
  sendTautulliNotification: (
    notifierId: number,
    ratingKey: string,
  ) => Promise<boolean>
}

/**
 * Create initial polling state
 */
export function createPollingState(): PollingState {
  return {
    pollInterval: null,
    isPolling: false,
  }
}

/**
 * Start the polling mechanism
 */
export function startPolling(state: PollingState, deps: PollingDeps): void {
  if (state.pollInterval || !deps.isActive()) {
    return
  }

  deps.log.debug('Starting Tautulli notification polling')

  // Process immediately
  void processPendingNotifications(state, deps)

  // Then set up interval
  state.pollInterval = setInterval(() => {
    void processPendingNotifications(state, deps)
  }, POLL_INTERVAL_MS)
}

/**
 * Stop the polling mechanism
 */
export function stopPolling(state: PollingState, log: FastifyBaseLogger): void {
  if (state.pollInterval) {
    clearInterval(state.pollInterval)
    state.pollInterval = null
    log.debug('Stopped Tautulli notification polling')
  }
}

/**
 * Process all pending notifications
 */
export async function processPendingNotifications(
  state: PollingState,
  deps: PollingDeps,
): Promise<void> {
  const { log, isActive, pendingNotifications, getRecentlyAdded } = deps

  if (!isActive()) {
    log.debug('Tautulli disabled during polling; stopping')
    stopPolling(state, log)
    return
  }

  if (state.isPolling) {
    log.debug('Polling already in progress, skipping')
    return
  }

  if (pendingNotifications.size === 0) {
    // Stop polling if no pending notifications
    if (state.pollInterval) {
      stopPolling(state, log)
    }
    return
  }

  state.isPolling = true
  const startTime = Date.now()

  try {
    // Get recently added items from Tautulli
    const recentItems = await getRecentlyAdded(100)

    if (!recentItems || recentItems.length === 0) {
      log.debug('No recently added items found in Tautulli')
      return
    }

    // Process each pending notification
    for (const [key, notification] of pendingNotifications) {
      // Check if service was disabled during processing
      if (!isActive()) {
        log.debug('Tautulli disabled during notification processing; stopping')
        stopPolling(state, log)
        return
      }
      await processSingleNotification(
        key,
        notification,
        recentItems,
        pendingNotifications,
        deps,
      )
    }

    // Clean up expired notifications
    cleanupExpiredNotifications(pendingNotifications, log)
  } catch (error) {
    log.error({ error }, 'Error processing pending notifications')
  } finally {
    const duration = Date.now() - startTime
    log.debug(
      {
        duration,
        pendingCount: pendingNotifications.size,
      },
      'Completed polling cycle',
    )
    state.isPolling = false
  }
}

/**
 * Process a single pending notification
 */
async function processSingleNotification(
  key: string,
  notification: PendingNotification,
  recentItems: RecentlyAddedItem[],
  pendingNotifications: Map<string, PendingNotification>,
  deps: PollingDeps,
): Promise<void> {
  const { log, findMatchingItem } = deps

  notification.attempts++

  // Find matching item in recently added
  const matchingItem = await findMatchingItem(notification, recentItems)

  if (matchingItem) {
    log.info(
      {
        title: notification.title,
        ratingKey: matchingItem.rating_key,
        attempts: notification.attempts,
      },
      'Found matching item in Tautulli, sending notifications',
    )

    // Send notifications to all interested users
    const results = await sendNotificationsForItem(
      notification,
      matchingItem,
      deps,
    )

    // If all notifications sent successfully, remove from queue
    if (results.every((r) => r.success)) {
      pendingNotifications.delete(key)
      log.info(
        { title: notification.title, users: results.length },
        'Successfully sent all Tautulli notifications',
      )
    } else {
      // Log failures but keep in queue for retry
      const failed = results.filter((r) => !r.success)
      // Remove successfully notified users to prevent duplicates on retry
      notification.interestedUsers = notification.interestedUsers.filter((u) =>
        failed.some((f) => f.username === u.username),
      )
      log.warn(
        {
          title: notification.title,
          failedUsers: failed.map((r) => r.username),
        },
        'Some Tautulli notifications failed, will retry',
      )
    }
  } else if (notification.attempts >= notification.maxAttempts) {
    log.warn(
      {
        title: notification.title,
        guid: notification.guid,
        attempts: notification.attempts,
      },
      'Max attempts reached for Tautulli notification, removing from queue',
    )
    pendingNotifications.delete(key)
  } else {
    log.debug(
      {
        title: notification.title,
        guid: notification.guid,
        attempts: notification.attempts,
        maxAttempts: notification.maxAttempts,
      },
      'Item not yet found in Tautulli, will retry',
    )
  }
}

/**
 * Send notifications for a found item
 */
async function sendNotificationsForItem(
  notification: PendingNotification,
  item: RecentlyAddedItem,
  deps: PollingDeps,
): Promise<Array<{ username: string; success: boolean }>> {
  const { log, sendTautulliNotification } = deps
  const results: Array<{ username: string; success: boolean }> = []

  for (const user of notification.interestedUsers) {
    try {
      const success = await sendTautulliNotification(
        user.notifierId,
        item.rating_key,
      )

      results.push({ username: user.username, success })
    } catch (error) {
      log.error(
        { error, user: user.username, title: notification.title },
        'Error sending Tautulli notification to user',
      )
      results.push({ username: user.username, success: false })
    }
  }

  return results
}
