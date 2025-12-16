/**
 * Delete Sync Notification Orchestration
 *
 * Handles sending notifications about delete sync results.
 * Supports Discord (webhook and/or DM) and Apprise channels based on configuration.
 */

import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type { SystemNotification } from '@root/types/discord.types.js'
import type { DatabaseService } from '@services/database.service.js'
import type { AppriseService } from '@services/notifications/channels/apprise.service.js'
import type { DiscordWebhookService } from '@services/notifications/channels/discord-webhook.service.js'
import type { DiscordBotService } from '@services/notifications/discord-bot/bot.service.js'
import { createDeleteSyncEmbed } from '@services/notifications/templates/discord-embeds.js'
import type { FastifyBaseLogger } from 'fastify'

// ============================================================================
// Types
// ============================================================================

export interface DeleteSyncDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
  discordBot: DiscordBotService
  discordWebhook: DiscordWebhookService
  apprise: AppriseService
  config: {
    deleteSyncNotify: string | null
    deleteSyncNotifyOnlyOnDeletion: boolean
    discordWebhookUrl?: string
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determines which notification channels should be used based on config setting.
 */
function getNotificationChannels(notifySetting: string): {
  sendWebhook: boolean
  sendDM: boolean
  sendApprise: boolean
} {
  const sendWebhook = [
    'all',
    'discord-only',
    'webhook-only',
    'discord-webhook',
    'discord-both',
    // Legacy values
    'webhook',
    'both',
  ].includes(notifySetting)

  const sendDM = [
    'all',
    'discord-only',
    'dm-only',
    'discord-message',
    'discord-both',
    // Legacy values
    'message',
    'both',
  ].includes(notifySetting)

  const sendApprise = ['all', 'apprise-only'].includes(notifySetting)

  return { sendWebhook, sendDM, sendApprise }
}

// ============================================================================
// Delivery Functions
// ============================================================================

async function sendDiscordWebhook(
  deps: DeleteSyncDeps,
  embed: ReturnType<typeof createDeleteSyncEmbed>,
): Promise<boolean> {
  if (!deps.config.discordWebhookUrl) {
    deps.logger.warn(
      'Discord webhook URL not configured, cannot send webhook notification',
    )
    return false
  }

  try {
    const payload = {
      embeds: [embed],
      username: 'Pulsarr Delete Sync',
      avatar_url:
        'https://raw.githubusercontent.com/jamcalli/Pulsarr/master/src/client/assets/images/pulsarr.png',
    }

    deps.logger.debug('Attempting to send delete sync webhook notification')
    const sent = await deps.discordWebhook.sendNotification(payload)

    if (sent) {
      deps.logger.info('Delete sync webhook notification sent successfully')
    } else {
      deps.logger.warn('Failed to send delete sync webhook notification')
    }

    return sent
  } catch (error) {
    deps.logger.error(
      { error },
      'Error sending delete sync webhook notification',
    )
    return false
  }
}

async function sendDiscordDM(
  deps: DeleteSyncDeps,
  embed: ReturnType<typeof createDeleteSyncEmbed>,
  results: DeleteSyncResult,
  dryRun: boolean,
): Promise<boolean> {
  try {
    const users = await deps.db.getAllUsers()
    const adminUser = users.find((user) => user.is_primary_token)

    const hasDeletedContent = results.total.deleted > 0
    const hasSkippedContent = results.total.skipped > 0
    const shouldNotify =
      dryRun ||
      hasDeletedContent ||
      hasSkippedContent ||
      results.safetyTriggered

    if (!shouldNotify) {
      deps.logger.info('Skipping DM notification as no activity to report')
      return false
    }

    if (!adminUser) {
      deps.logger.warn(
        'Admin user not found - skipping delete sync DM notification',
      )
      return false
    }

    if (!adminUser.discord_id) {
      deps.logger.warn(
        `Admin user ${adminUser.name} has no Discord ID - skipping delete sync DM notification`,
      )
      return false
    }

    const systemNotification: SystemNotification = {
      type: 'system',
      username: adminUser.name,
      title: embed.title || 'Delete Sync Results',
      embedFields: embed.fields || [],
      safetyTriggered: results.safetyTriggered,
    }

    deps.logger.debug(
      `Attempting to send DM to admin ${adminUser.name} (${adminUser.discord_id})`,
    )

    const sent = await deps.discordBot.sendDirectMessage(
      adminUser.discord_id,
      systemNotification,
    )

    if (sent) {
      deps.logger.info(
        `Sent delete sync DM notification to admin ${adminUser.name}`,
      )
    } else {
      deps.logger.warn(
        `Failed to send DM to admin ${adminUser.name} (${adminUser.discord_id})`,
      )
    }

    return sent
  } catch (error) {
    deps.logger.error({ error }, 'Error sending delete sync DM notification')
    return false
  }
}

async function sendAppriseNotification(
  deps: DeleteSyncDeps,
  results: DeleteSyncResult,
  dryRun: boolean,
): Promise<boolean> {
  if (!deps.apprise.isEnabled()) {
    deps.logger.debug('Apprise not enabled, skipping notification')
    return false
  }

  try {
    const sent = await deps.apprise.sendDeleteSyncNotification(results, dryRun)

    if (sent) {
      deps.logger.info('Delete sync Apprise notification sent successfully')
    } else {
      deps.logger.warn('Failed to send delete sync Apprise notification')
    }

    return sent
  } catch (error) {
    deps.logger.error(
      { error },
      'Error sending delete sync Apprise notification',
    )
    return false
  }
}

// ============================================================================
// Main Orchestration Function
// ============================================================================

/**
 * Sends delete sync result notifications to configured channels.
 * Supports Discord webhook, Discord DM, and Apprise based on configuration.
 *
 * @param deps - Service dependencies
 * @param results - Delete sync operation results
 * @param dryRun - Whether this was a dry run
 * @returns Promise resolving to boolean indicating if any notifications were sent
 */
export async function sendDeleteSyncCompleted(
  deps: DeleteSyncDeps,
  results: DeleteSyncResult,
  dryRun: boolean,
): Promise<boolean> {
  const { logger, config } = deps
  const notifySetting = config.deleteSyncNotify || 'none'

  // Skip all notifications if disabled
  if (notifySetting === 'none') {
    logger.info(
      'Delete sync notifications disabled, skipping all notifications',
    )
    return false
  }

  // Skip if configured to only notify on deletions and none occurred
  if (config.deleteSyncNotifyOnlyOnDeletion && results.total.deleted === 0) {
    logger.info(
      'Delete sync completed with no deletions, skipping notification as per configuration',
    )
    return false
  }

  const { sendWebhook, sendDM, sendApprise } =
    getNotificationChannels(notifySetting)

  logger.debug(
    `Will attempt to send notifications: Webhook=${sendWebhook}, DM=${sendDM}, Apprise=${sendApprise}`,
  )

  // Create embed once for Discord channels
  const embed = createDeleteSyncEmbed(results, dryRun)

  // Send to all configured channels in parallel
  const promises: Promise<boolean>[] = []

  if (sendWebhook) {
    promises.push(sendDiscordWebhook(deps, embed))
  }

  if (sendDM) {
    promises.push(sendDiscordDM(deps, embed, results, dryRun))
  }

  if (sendApprise) {
    promises.push(sendAppriseNotification(deps, results, dryRun))
  }

  const results_arr = await Promise.all(promises)
  const successCount = results_arr.filter(Boolean).length

  logger.info(
    `Delete sync notification attempt complete: ${successCount} messages sent successfully`,
  )

  return successCount > 0
}
