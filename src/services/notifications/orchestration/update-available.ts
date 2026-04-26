/**
 * Update Available Notification Orchestration
 *
 * Sends a one-shot system notification when a newer GitHub release is
 * detected. Reuses the existing Discord webhook + Apprise system pipelines
 * (the same channels used by delete-sync notifications) so that operators
 * who already configured those channels need no extra setup.
 *
 * Triggered by `src/plugins/custom/update-check.ts` once per day. Caller is
 * responsible for persisting `lastNotifiedVersion` in config after a
 * successful send so the same release is not announced repeatedly.
 */

import type { SystemNotification } from '@root/types/discord.types.js'
import type { AppriseService } from '@services/notifications/channels/apprise.service.js'
import type { DiscordWebhookService } from '@services/notifications/channels/discord-webhook.service.js'
import type { UpdateCheckResult } from '@services/update-check.service.js'
import type { FastifyBaseLogger } from 'fastify'

// Discord embed description limit is 4096 chars; trim well below to leave
// room for the "View full release notes" suffix.
const DISCORD_BODY_MAX_CHARS = 3500
const APPRISE_BODY_MAX_CHARS = 3500

export interface UpdateAvailableDeps {
  logger: FastifyBaseLogger
  discordWebhook: DiscordWebhookService
  apprise: AppriseService
  config: {
    discordWebhookUrl?: string
  }
}

/**
 * Truncate a release body on the nearest newline boundary so we never cut
 * mid-line. Returns the trimmed text and a `truncated` flag.
 */
function truncateBody(
  body: string,
  max: number,
): { text: string; truncated: boolean } {
  if (body.length <= max) return { text: body, truncated: false }
  const slice = body.slice(0, max)
  const lastNewline = slice.lastIndexOf('\n')
  const cutAt = lastNewline > max / 2 ? lastNewline : max
  return { text: body.slice(0, cutAt).trimEnd(), truncated: true }
}

async function sendDiscordWebhook(
  deps: UpdateAvailableDeps,
  result: UpdateCheckResult,
): Promise<boolean> {
  if (!deps.config.discordWebhookUrl?.trim()) {
    deps.logger.debug(
      'Discord webhook URL not configured, skipping update notification webhook',
    )
    return false
  }

  const body = result.releaseBody ?? ''
  const { text, truncated } = truncateBody(body, DISCORD_BODY_MAX_CHARS)
  const description =
    text.length > 0
      ? truncated && result.releaseUrl
        ? `${text}\n\n…\n[View full release notes →](${result.releaseUrl})`
        : text
      : 'No release notes were published for this version.'

  const title =
    result.releaseName?.trim() || `Pulsarr v${result.latestVersion} available`

  const payload = {
    embeds: [
      {
        title: title.length > 256 ? `${title.slice(0, 253)}...` : title,
        url: result.releaseUrl ?? undefined,
        description,
        color: 0x48bb78, // Pulsarr green
        timestamp: result.publishedAt ?? new Date().toISOString(),
        footer: {
          text: `You're running v${result.currentVersion} → v${result.latestVersion} available`,
        },
      },
    ],
    username: 'Pulsarr Updates',
    avatar_url:
      'https://raw.githubusercontent.com/jamcalli/Pulsarr/master/src/client/assets/images/pulsarr.png',
  }

  try {
    const sent = await deps.discordWebhook.sendNotification(payload)
    if (sent) {
      deps.logger.info(
        { latestVersion: result.latestVersion },
        'Sent Discord update-available webhook notification',
      )
    } else {
      deps.logger.warn('Failed to send Discord update-available webhook')
    }
    return sent
  } catch (error) {
    deps.logger.error(
      { error },
      'Error sending Discord update-available webhook',
    )
    return false
  }
}

async function sendAppriseNotification(
  deps: UpdateAvailableDeps,
  result: UpdateCheckResult,
): Promise<boolean> {
  if (!deps.apprise.isEnabled()) {
    deps.logger.debug(
      'Apprise not enabled, skipping update-available system notification',
    )
    return false
  }

  const body = result.releaseBody ?? ''
  const { text, truncated } = truncateBody(body, APPRISE_BODY_MAX_CHARS)
  const releaseNotesValue =
    text.length > 0
      ? truncated
        ? `${text}\n\n…`
        : text
      : '_No release notes were published for this version._'

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: 'Current', value: `v${result.currentVersion}`, inline: true },
    { name: 'Latest', value: `v${result.latestVersion}`, inline: true },
  ]
  if (result.releaseUrl) {
    fields.push({
      name: 'Release',
      value: result.releaseUrl,
      inline: false,
    })
  }
  fields.push({
    name: 'Release Notes',
    value: releaseNotesValue,
    inline: false,
  })

  const notification: SystemNotification = {
    type: 'system',
    username: 'Pulsarr',
    title:
      result.releaseName?.trim() ||
      `Pulsarr v${result.latestVersion} available`,
    embedFields: fields,
  }

  try {
    const sent = await deps.apprise.sendSystemNotification(notification)
    if (sent) {
      deps.logger.info(
        { latestVersion: result.latestVersion },
        'Sent Apprise update-available system notification',
      )
    } else {
      deps.logger.warn('Failed to send Apprise update-available notification')
    }
    return sent
  } catch (error) {
    deps.logger.error(
      { error },
      'Error sending Apprise update-available notification',
    )
    return false
  }
}

/**
 * Sends an "update available" notification through every configured system
 * channel (Discord webhook + Apprise system endpoint). Returns true if at
 * least one channel succeeded; the caller should then persist
 * `lastNotifiedVersion` to avoid re-notifying for the same release.
 */
export async function sendUpdateAvailableNotification(
  deps: UpdateAvailableDeps,
  result: UpdateCheckResult,
): Promise<boolean> {
  if (!result.updateAvailable || !result.latestVersion) {
    deps.logger.debug(
      'sendUpdateAvailableNotification called with no update; ignoring',
    )
    return false
  }

  const results = await Promise.all([
    sendDiscordWebhook(deps, result),
    sendAppriseNotification(deps, result),
  ])

  const successCount = results.filter(Boolean).length
  deps.logger.info(
    {
      latestVersion: result.latestVersion,
      currentVersion: result.currentVersion,
      successCount,
    },
    `Update-available notification attempt complete: ${successCount} channels delivered`,
  )

  return successCount > 0
}
