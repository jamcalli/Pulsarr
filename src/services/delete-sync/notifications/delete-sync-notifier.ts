import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type { NotificationService } from '@services/notification.service.js'
import type { AppriseService } from '@services/notifications/channels/apprise.service.js'
import type { FastifyBaseLogger } from 'fastify'

export interface DeleteSyncNotifierDeps {
  notifications: NotificationService | null
  apprise: AppriseService | null
  config: {
    deleteSyncNotify: string | null
    deleteSyncNotifyOnlyOnDeletion: boolean
  }
  logger: FastifyBaseLogger
}

/**
 * Sends notifications about delete sync results if enabled
 * Supports Discord (webhook, DM, or both) and Apprise notifications
 */
export async function sendNotificationsIfEnabled(
  deps: DeleteSyncNotifierDeps,
  result: DeleteSyncResult,
  dryRun: boolean,
): Promise<void> {
  const { notifications, apprise, config, logger } = deps
  const notifySetting = config.deleteSyncNotify || 'none'

  // Skip all notifications if set to none
  if (notifySetting === 'none') {
    logger.info(
      'Delete sync notifications disabled, skipping all notifications',
    )
    return
  }

  // Check if we should only notify when items were actually deleted
  if (config.deleteSyncNotifyOnlyOnDeletion && result.total.deleted === 0) {
    logger.info(
      'Delete sync completed with no deletions, skipping notification as per configuration',
    )
    return
  }

  const sendDiscord = [
    // Modern values
    'all',
    'discord-only',
    'discord-webhook',
    'discord-message',
    'discord-both',
    'webhook-only',
    'dm-only',
    // Legacy values (back-compat)
    'message',
    'webhook',
    'both',
  ].includes(notifySetting)

  const sendApprise = ['all', 'apprise-only'].includes(notifySetting)

  // Discord notification logic
  if (sendDiscord && notifications) {
    try {
      // Pass notification preference to control webhook vs DM
      await notifications.sendDeleteSyncNotification(
        result,
        dryRun,
        notifySetting,
      )
    } catch (notifyError) {
      logger.error(
        {
          error:
            notifyError instanceof Error
              ? notifyError
              : new Error(String(notifyError)),
        },
        'Error sending delete sync Discord notification:',
      )
    }
  }

  // Apprise notification logic
  if (sendApprise && apprise?.isEnabled()) {
    try {
      await apprise.sendDeleteSyncNotification(result, dryRun)
    } catch (notifyError) {
      logger.error(
        {
          error:
            notifyError instanceof Error
              ? notifyError
              : new Error(String(notifyError)),
        },
        'Error sending delete sync Apprise notification:',
      )
    }
  }
}
