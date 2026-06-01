import type { UpdateNotifyOption } from '@root/types/config.types.js'
import type { DatabaseService } from '@services/database.service.js'
import type { AppriseService } from '@services/notifications/channels/apprise.service.js'
import type { DiscordWebhookService } from '@services/notifications/channels/discord-webhook.service.js'
import type { DiscordBotService } from '@services/notifications/discord-bot/index.js'
import { createUpdateAvailableEmbed } from '@services/notifications/templates/discord-embeds.js'
import type { FastifyBaseLogger } from 'fastify'

export interface UpdateAvailableRelease {
  currentVersion: string
  latestVersion: string
  releaseUrl: string
  releaseName: string | null
  releaseBody: string | null
  releaseBodyHtml: string | null
  publishedAt: string | null
}

export interface UpdateAvailableDeps {
  logger: FastifyBaseLogger
  db: DatabaseService
  discordWebhook: DiscordWebhookService
  discordBot: DiscordBotService
  apprise: AppriseService
  config: {
    notifyOnUpdate: UpdateNotifyOption
    discordWebhookUrl?: string
  }
}

interface UpdateNotificationChannels {
  sendWebhook: boolean
  sendDM: boolean
  sendApprise: boolean
}

function getUpdateNotificationChannels(
  setting: UpdateNotifyOption,
): UpdateNotificationChannels {
  const sendWebhook = ['all', 'discord-only', 'webhook-only'].includes(setting)
  const sendDM = ['all', 'discord-only', 'dm-only'].includes(setting)
  const sendApprise = ['all', 'apprise-only'].includes(setting)
  return { sendWebhook, sendDM, sendApprise }
}

async function sendDiscordWebhook(
  deps: UpdateAvailableDeps,
  release: UpdateAvailableRelease,
): Promise<boolean> {
  if (!deps.config.discordWebhookUrl) {
    deps.logger.debug(
      'Discord webhook URL not configured, skipping update-available webhook',
    )
    return false
  }

  try {
    const embed = createUpdateAvailableEmbed(release)
    const payload = {
      embeds: [embed],
      username: 'Pulsarr Updates',
      avatar_url:
        'https://raw.githubusercontent.com/jamcalli/Pulsarr/master/src/client/assets/images/pulsarr.png',
      // Suppress @everyone/@here that may appear in release notes.
      allowed_mentions: { parse: [] as Array<'roles' | 'users' | 'everyone'> },
    }

    const sent = await deps.discordWebhook.sendNotification(payload)
    if (sent) {
      deps.logger.info(
        { latestVersion: release.latestVersion },
        'Update-available webhook notification sent',
      )
    } else {
      deps.logger.warn('Failed to send update-available webhook notification')
    }
    return sent
  } catch (error) {
    deps.logger.error(
      { error },
      'Error sending update-available webhook notification',
    )
    return false
  }
}

async function sendDiscordDM(
  deps: UpdateAvailableDeps,
  release: UpdateAvailableRelease,
): Promise<boolean> {
  if (deps.discordBot.getBotStatus() !== 'running') {
    deps.logger.debug('Discord bot not running, skipping update-available DM')
    return false
  }

  try {
    const primaryUser = await deps.db.getPrimaryUser()
    if (!primaryUser?.discord_id) {
      deps.logger.debug(
        'Primary user has no Discord ID, skipping update-available DM',
      )
      return false
    }

    const embed = createUpdateAvailableEmbed(release)
    const sent = await deps.discordBot.sendDirectMessageEmbed(
      primaryUser.discord_id,
      embed,
    )
    if (sent) {
      deps.logger.info(
        { latestVersion: release.latestVersion },
        'Update-available DM notification sent',
      )
    } else {
      deps.logger.warn('Failed to send update-available DM notification')
    }
    return sent
  } catch (error) {
    deps.logger.error(
      { error },
      'Error sending update-available DM notification',
    )
    return false
  }
}

async function sendApprise(
  deps: UpdateAvailableDeps,
  release: UpdateAvailableRelease,
): Promise<boolean> {
  if (!deps.apprise.isEnabled()) {
    deps.logger.debug('Apprise not enabled, skipping update-available Apprise')
    return false
  }

  try {
    const sent = await deps.apprise.sendUpdateAvailableNotification(release)
    if (sent) {
      deps.logger.info(
        { latestVersion: release.latestVersion },
        'Update-available Apprise notification sent',
      )
    } else {
      deps.logger.warn('Failed to send update-available Apprise notification')
    }
    return sent
  } catch (error) {
    deps.logger.error(
      { error },
      'Error sending update-available Apprise notification',
    )
    return false
  }
}

export async function sendUpdateAvailable(
  deps: UpdateAvailableDeps,
  release: UpdateAvailableRelease,
): Promise<boolean> {
  const channels = getUpdateNotificationChannels(deps.config.notifyOnUpdate)
  const tasks: Array<Promise<boolean>> = []
  if (channels.sendWebhook) tasks.push(sendDiscordWebhook(deps, release))
  if (channels.sendDM) tasks.push(sendDiscordDM(deps, release))
  if (channels.sendApprise) tasks.push(sendApprise(deps, release))

  if (tasks.length === 0) return false

  const results = await Promise.all(tasks)
  const successCount = results.filter(Boolean).length
  deps.logger.info(
    { successCount, latestVersion: release.latestVersion },
    'Update-available notification dispatch complete',
  )
  return successCount > 0
}
