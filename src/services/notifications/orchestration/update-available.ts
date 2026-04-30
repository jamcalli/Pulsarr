/**
 * Update-Available Notification Orchestration
 *
 * Sends out-of-app notifications when the server-side update check finds a
 * newer Pulsarr release. Mirrors the shape of `delete-sync.ts` orchestration:
 * Discord webhook + Apprise system endpoint, each via its own dedicated
 * helper (NOT via `sendSystemNotification`, which is the approval template).
 *
 * The plugin owns dedup against `lastNotifiedVersion`; this layer only
 * decides whether the notification was actually delivered.
 */

import type { AppriseService } from '@services/notifications/channels/apprise.service.js'
import type { DiscordWebhookService } from '@services/notifications/channels/discord-webhook.service.js'
import { createUpdateAvailableEmbed } from '@services/notifications/templates/discord-embeds.js'
import type { FastifyBaseLogger } from 'fastify'

export interface UpdateAvailableRelease {
  currentVersion: string
  latestVersion: string
  releaseUrl: string
  releaseName: string | null
  releaseBody: string | null
  publishedAt: string | null
}

export interface UpdateAvailableDeps {
  logger: FastifyBaseLogger
  discordWebhook: DiscordWebhookService
  apprise: AppriseService
  config: {
    discordWebhookUrl?: string
  }
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
      // GitHub release notes are user-authored and could contain @everyone,
      // @here, or user/role mention strings that would ping the admin
      // channel. Suppress all mentions on this admin-channel webhook.
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

/**
 * Sends an "update available" notification through every configured channel.
 *
 * Returns true when at least one channel delivered successfully so the caller
 * can persist `lastNotifiedVersion` and avoid retry storms next cron tick.
 */
export async function sendUpdateAvailable(
  deps: UpdateAvailableDeps,
  release: UpdateAvailableRelease,
): Promise<boolean> {
  const results = await Promise.all([
    sendDiscordWebhook(deps, release),
    sendApprise(deps, release),
  ])

  const successCount = results.filter(Boolean).length
  deps.logger.info(
    { successCount, latestVersion: release.latestVersion },
    'Update-available notification dispatch complete',
  )

  return successCount > 0
}
