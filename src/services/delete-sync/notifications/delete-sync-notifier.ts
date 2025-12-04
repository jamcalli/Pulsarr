import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type { AppriseNotificationService } from '@services/apprise-notifications.service.js'
import type { DiscordNotificationService } from '@services/discord-notifications.service.js'
import type { FastifyBaseLogger } from 'fastify'

export interface DeleteSyncNotifierDeps {
  discord: DiscordNotificationService | null
  apprise: AppriseNotificationService | null
  config: {
    deleteSyncNotify: string | null
    deleteSyncNotifyOnlyOnDeletion: boolean
  }
  log: FastifyBaseLogger
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
  const { discord, apprise, config, log } = deps
  const notifySetting = config.deleteSyncNotify || 'none'

  // Skip all notifications if set to none
  if (notifySetting === 'none') {
    log.info('Delete sync notifications disabled, skipping all notifications')
    return
  }

  // Check if we should only notify when items were actually deleted
  if (config.deleteSyncNotifyOnlyOnDeletion && result.total.deleted === 0) {
    log.info(
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
  if (sendDiscord && discord) {
    try {
      // Pass notification preference to control webhook vs DM
      await discord.sendDeleteSyncNotification(result, dryRun, notifySetting)
    } catch (notifyError) {
      log.error(
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
      await apprise?.sendDeleteSyncNotification(result, dryRun)
    } catch (notifyError) {
      log.error(
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
