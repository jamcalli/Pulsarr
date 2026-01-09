/**
 * Approval Notification Orchestration
 *
 * Handles sending notifications about approval requests to admin channels.
 * Supports Discord (webhook and/or DM) and Apprise based on configuration.
 *
 * ApprovalService owns WHEN to send (debouncing, batching queue).
 * This module owns HOW to send (channel routing, embeds, delivery).
 */

import { buildRoutingPayload } from '@root/schemas/webhooks/webhook-payloads.schema.js'
import type {
  DiscordEmbed,
  SystemNotification,
} from '@root/types/discord.types.js'
import { getTmdbUrl } from '@root/utils/guid-handler.js'
import { buildPosterUrl } from '@root/utils/poster-url.js'
import type { DatabaseService } from '@services/database.service.js'
import type { AppriseService } from '@services/notifications/channels/apprise.service.js'
import type { DiscordWebhookService } from '@services/notifications/channels/discord-webhook.service.js'
import { dispatchWebhooks } from '@services/notifications/channels/native-webhook.js'
import type { DiscordBotService } from '@services/notifications/discord-bot/bot.service.js'
import type { FastifyBaseLogger } from 'fastify'

// ============================================================================
// Types
// ============================================================================

export interface ApprovalBatchDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
  discordBot: DiscordBotService
  discordWebhook: DiscordWebhookService
  apprise: AppriseService
  config: {
    approvalNotify: string | null
  }
}

export interface ApprovalRequest {
  id: number
  contentTitle: string
  contentType: 'movie' | 'show'
  contentKey: string
  contentGuids?: string[]
  userId: number
  userName: string | null
  triggeredBy:
    | 'quota_exceeded'
    | 'router_rule'
    | 'manual_flag'
    | 'content_criteria'
  approvalReason: string | null
  // Router decision containing proposed routing (if approval was triggered by routing rules)
  proposedRouterDecision?: {
    approval?: {
      proposedRouting?: {
        instanceId: number
        instanceType: 'radarr' | 'sonarr'
        qualityProfile?: number | string | null
        rootFolder?: string | null
        tags?: string[]
        searchOnAdd?: boolean | null
        minimumAvailability?: string | null
        monitor?: 'movieOnly' | 'movieAndCollection' | 'none' | null
        seasonMonitoring?: string | null
        seriesType?: 'standard' | 'anime' | 'daily' | null
        syncedInstances?: number[]
      }
    }
  }
}

export interface ApprovalNotificationChannels {
  sendWebhook: boolean
  sendDM: boolean
  sendApprise: boolean
}

// ============================================================================
// Channel Routing
// ============================================================================

/**
 * Determines which notification channels should be used based on the config setting.
 * @param notifySetting - The approvalNotify config value
 */
export function getApprovalNotificationChannels(
  notifySetting: string,
): ApprovalNotificationChannels {
  const sendWebhook = [
    'all',
    'discord-only',
    'webhook-only',
    'discord-webhook',
    'discord-both',
  ].includes(notifySetting)

  const sendDM = [
    'all',
    'discord-only',
    'dm-only',
    'discord-message',
    'discord-both',
  ].includes(notifySetting)

  const sendApprise = ['all', 'apprise-only'].includes(notifySetting)

  return { sendWebhook, sendDM, sendApprise }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Formats trigger reason for display in notifications.
 */
export function formatTriggerReason(
  trigger: string,
  reason: string | null,
): string {
  const triggerMap: Record<string, string> = {
    manual_flag: 'Manual Flag',
    quota_exceeded: 'Quota Exceeded',
    user_request: 'User Request',
    system_flag: 'System Flag',
  }

  const triggerText = triggerMap[trigger] || trigger
  return reason ? `${triggerText}\n${reason}` : triggerText
}

/**
 * Creates a Discord embed for a single approval request (webhook).
 */
export function createApprovalWebhookEmbed(
  request: ApprovalRequest,
  totalPending: number,
  posterUrl?: string,
): DiscordEmbed {
  // Generate TMDB URL from content GUIDs
  const tmdbUrl = getTmdbUrl(request.contentGuids, request.contentType)

  const fields = [
    {
      name: 'Requested by',
      value: request.userName || `User ${request.userId}`,
      inline: true,
    },
    {
      name: 'Pending requests',
      value: `${totalPending} awaiting review`,
      inline: true,
    },
    {
      name: 'Reason for approval',
      value: formatTriggerReason(request.triggeredBy, request.approvalReason),
      inline: false,
    },
  ]

  // Add TMDB link if available
  if (tmdbUrl) {
    fields.push({
      name: 'More Info',
      value: `[View on TMDB](${tmdbUrl})`,
      inline: true,
    })
  }

  const embed: DiscordEmbed = {
    title: 'Content Approval Required',
    description: `**${request.contentTitle}** (${request.contentType.charAt(0).toUpperCase() + request.contentType.slice(1)})`,
    color: 0xff9500,
    timestamp: new Date().toISOString(),
    fields,
    footer: {
      text: `Request ID: ${request.id}`,
    },
  }

  if (posterUrl) {
    embed.image = { url: posterUrl }
  }

  return embed
}

/**
 * Creates embed fields for a batched DM notification.
 */
export function createBatchedDMFields(
  queuedRequests: ApprovalRequest[],
  totalPending: number,
): Array<{ name: string; value: string; inline: boolean }> {
  const embedFields = [
    {
      name: 'Pending Approvals',
      value: `${totalPending} awaiting review`,
      inline: false,
    },
    {
      name: '\u200b',
      value: '\u200b',
      inline: false,
    },
  ]

  const isMultiple = queuedRequests.length > 1

  if (isMultiple) {
    // Show summary for multiple requests
    const movieCount = queuedRequests.filter(
      (r) => r.contentType === 'movie',
    ).length
    const showCount = queuedRequests.filter(
      (r) => r.contentType === 'show',
    ).length

    const contentSummary = []
    if (movieCount > 0)
      contentSummary.push(`${movieCount} movie${movieCount > 1 ? 's' : ''}`)
    if (showCount > 0)
      contentSummary.push(`${showCount} show${showCount > 1 ? 's' : ''}`)

    embedFields.push({
      name: 'New Requests',
      value: `${contentSummary.join(' and ')} added to queue`,
      inline: false,
    })

    // Show first few titles as examples
    const exampleTitles = queuedRequests
      .slice(0, 3)
      .map((r) => `• ${r.contentTitle}`)
      .join('\n')

    const moreText =
      queuedRequests.length > 3
        ? `\n... and ${queuedRequests.length - 3} more`
        : ''

    embedFields.push({
      name: 'Recent Requests',
      value: exampleTitles + moreText,
      inline: false,
    })
  } else {
    // Show details for single request
    const request = queuedRequests[0]
    embedFields.push(
      {
        name: 'Latest Request',
        value: `${request.contentTitle} (${request.contentType.charAt(0).toUpperCase() + request.contentType.slice(1)})`,
        inline: false,
      },
      {
        name: 'Requested by',
        value: request.userName || `User ${request.userId}`,
        inline: true,
      },
      {
        name: 'Reason for approval',
        value: formatTriggerReason(request.triggeredBy, request.approvalReason),
        inline: false,
      },
    )
  }

  return embedFields
}

/**
 * Creates an Apprise system notification payload for an approval request.
 */
export function createAppriseApprovalPayload(
  request: ApprovalRequest,
  totalPending: number,
  posterUrl?: string,
): {
  type: 'system'
  username: string
  title: string
  embedFields: Array<{ name: string; value: string; inline: boolean }>
  posterUrl?: string
  tmdbUrl?: string
} {
  const contentType =
    request.contentType.charAt(0).toUpperCase() + request.contentType.slice(1)
  const requester = request.userName || `User ${request.userId}`
  const reason = formatTriggerReason(
    request.triggeredBy,
    request.approvalReason,
  )

  // Generate TMDB URL from content GUIDs
  const tmdbUrl = getTmdbUrl(request.contentGuids, request.contentType)

  return {
    type: 'system' as const,
    username: 'Approval System',
    title: `New Approval Request: ${request.contentTitle}`,
    embedFields: [
      { name: 'Content', value: request.contentTitle, inline: false },
      { name: 'Type', value: contentType, inline: true },
      { name: 'Requested by', value: requester, inline: true },
      { name: 'Reason', value: reason, inline: false },
      {
        name: 'Total pending',
        value: `${totalPending} requests`,
        inline: false,
      },
      {
        name: 'Action Required',
        value:
          'Visit the Pulsarr UI to review and handle this approval request.',
        inline: false,
      },
    ],
    posterUrl,
    tmdbUrl,
  }
}

// ============================================================================
// Delivery Functions
// ============================================================================

/**
 * Sends batched Discord DM notification to primary admin.
 */
async function sendDiscordDM(
  deps: ApprovalBatchDeps,
  queuedRequests: ApprovalRequest[],
  totalPending: number,
): Promise<boolean> {
  const { db, logger, discordBot } = deps

  try {
    // Check if Discord bot is available and running
    if (discordBot.getBotStatus() !== 'running') {
      logger.debug(
        'Discord bot not available, skipping batched approval notification',
      )
      return false
    }

    // Get primary admin user
    const primaryUser = await db.getPrimaryUser()
    if (!primaryUser?.discord_id) {
      logger.debug(
        'Primary user has no Discord ID, skipping batched approval notification',
      )
      return false
    }

    // Build notification content
    const isMultiple = queuedRequests.length > 1
    const title = isMultiple
      ? `${queuedRequests.length} New Approval Requests`
      : 'New Approval Request'

    const embedFields = createBatchedDMFields(queuedRequests, totalPending)

    // Generate TMDB URL for single request notifications
    let tmdbUrl: string | undefined
    if (!isMultiple && queuedRequests.length === 1) {
      const request = queuedRequests[0]
      tmdbUrl = getTmdbUrl(request.contentGuids, request.contentType)
    }

    const systemNotification: SystemNotification = {
      type: 'system',
      username: 'Approval System',
      title,
      embedFields,
      tmdbUrl,
      actionButton: {
        label: 'Review Approvals',
        customId: `review_approvals_${Date.now()}`,
        style: 'Primary',
      },
    }

    const sent = await discordBot.sendDirectMessage(
      primaryUser.discord_id,
      systemNotification,
    )

    if (sent) {
      logger.info(
        {
          queueSize: queuedRequests.length,
          adminDiscordId: primaryUser.discord_id,
          totalPending,
        },
        'Sent batched Discord DM notification for approval requests',
      )
    }

    return sent
  } catch (error) {
    logger.error({ error }, 'Error sending batched Discord DM notification')
    return false
  }
}

/**
 * Sends individual Discord webhook notifications for each approval request.
 */
async function sendDiscordWebhooks(
  deps: ApprovalBatchDeps,
  queuedRequests: ApprovalRequest[],
  totalPending: number,
  posterMap: Map<string, string>,
): Promise<boolean> {
  const { logger, discordWebhook } = deps

  try {
    let sentCount = 0

    for (const request of queuedRequests) {
      const posterUrl = posterMap.get(request.contentKey)
      const embed = createApprovalWebhookEmbed(request, totalPending, posterUrl)

      const payload = {
        embeds: [embed],
        username: 'Pulsarr Approvals',
        avatar_url:
          'https://raw.githubusercontent.com/jamcalli/Pulsarr/master/src/client/assets/images/pulsarr.png',
      }

      const sent = await discordWebhook.sendNotification(payload)
      if (sent) sentCount++
    }

    if (sentCount > 0) {
      logger.info(
        { count: sentCount },
        'Sent Discord webhook notifications for approval requests',
      )
    }

    return sentCount > 0
  } catch (error) {
    logger.error({ error }, 'Error sending Discord webhook notifications')
    return false
  }
}

/**
 * Sends individual Apprise notifications for each approval request.
 */
async function sendAppriseNotifications(
  deps: ApprovalBatchDeps,
  queuedRequests: ApprovalRequest[],
  totalPending: number,
  posterMap: Map<string, string>,
): Promise<boolean> {
  const { logger, apprise } = deps

  try {
    if (!apprise.isEnabled()) {
      logger.debug('Apprise not enabled, skipping notifications')
      return false
    }

    let sentCount = 0

    for (const request of queuedRequests) {
      const posterUrl = posterMap.get(request.contentKey)
      const payload = createAppriseApprovalPayload(
        request,
        totalPending,
        posterUrl,
      )

      const sent = await apprise.sendSystemNotification(payload)
      if (sent) sentCount++
    }

    if (sentCount > 0) {
      logger.info(
        { count: sentCount },
        'Sent Apprise notifications for approval requests',
      )
    }

    return sentCount > 0
  } catch (error) {
    logger.error({ error }, 'Error sending Apprise notifications')
    return false
  }
}

// ============================================================================
// Poster Fetching Helper
// ============================================================================

/**
 * Batch fetches poster URLs for all approval requests.
 * Returns a map of contentKey to posterUrl to avoid N+1 queries.
 */
async function fetchPosterUrls(
  db: DatabaseService,
  logger: FastifyBaseLogger,
  queuedRequests: ApprovalRequest[],
): Promise<Map<string, string>> {
  const posterMap = new Map<string, string>()
  const contentKeys = queuedRequests.map((r) => r.contentKey)

  try {
    const watchlistItems = await db.getWatchlistItemsByKeys(contentKeys)
    for (const item of watchlistItems) {
      if (item.thumb) {
        const posterUrl = buildPosterUrl(item.thumb, 'notification')
        if (posterUrl) {
          posterMap.set(item.key, posterUrl)
        }
      }
    }
  } catch (error) {
    logger.debug(
      { error },
      'Could not batch fetch posters for approval notifications',
    )
  }

  return posterMap
}

// ============================================================================
// Main Orchestration Function
// ============================================================================

/**
 * Sends approval batch notifications to configured channels.
 * Called by ApprovalService after debounce timer fires.
 *
 * @param deps - Service dependencies
 * @param queuedRequests - Approval requests to notify about
 * @param totalPending - Total pending approval count
 * @returns Promise resolving to number of channels that sent successfully
 */
export async function sendApprovalBatch(
  deps: ApprovalBatchDeps,
  queuedRequests: ApprovalRequest[],
  totalPending: number,
): Promise<number> {
  const { db, logger, config } = deps
  const notifySetting = config.approvalNotify || 'none'

  // Skip all notifications if disabled
  if (notifySetting === 'none') {
    logger.debug('Approval notifications disabled, skipping')
    return 0
  }

  if (queuedRequests.length === 0) {
    logger.debug('No queued requests to notify about')
    return 0
  }

  const { sendWebhook, sendDM, sendApprise } =
    getApprovalNotificationChannels(notifySetting)

  logger.debug(
    `Will attempt to send approval notifications: Webhook=${sendWebhook}, DM=${sendDM}, Apprise=${sendApprise}`,
  )

  // Batch fetch posters once to avoid N+1 queries
  const posterMap = await fetchPosterUrls(db, logger, queuedRequests)

  // Send to all configured channels in parallel
  const promises: Promise<boolean>[] = []

  if (sendDM) {
    promises.push(sendDiscordDM(deps, queuedRequests, totalPending))
  }

  if (sendWebhook) {
    promises.push(
      sendDiscordWebhooks(deps, queuedRequests, totalPending, posterMap),
    )
  }

  if (sendApprise) {
    promises.push(
      sendAppriseNotifications(deps, queuedRequests, totalPending, posterMap),
    )
  }

  const results = await Promise.all(promises)
  const successCount = results.filter(Boolean).length

  logger.info(
    `Approval notification attempt complete: ${successCount} channels sent successfully`,
  )

  // Dispatch native webhooks for each approval request (fire-and-forget)
  // This runs regardless of other notification channel settings
  for (const request of queuedRequests) {
    const posterUrl = posterMap.get(request.contentKey)
    const proposedRouting =
      request.proposedRouterDecision?.approval?.proposedRouting
    void dispatchWebhooks(
      'approval.created',
      {
        approvalId: request.id,
        content: {
          title: request.contentTitle,
          type: request.contentType,
          key: request.contentKey,
          posterUrl,
        },
        requestedBy: {
          userId: request.userId,
          username: request.userName,
        },
        triggeredBy: request.triggeredBy,
        approvalReason: request.approvalReason,
        pendingCount: totalPending,
        proposedRouting: proposedRouting
          ? buildRoutingPayload(proposedRouting)
          : undefined,
      },
      { db, log: logger },
    )
  }

  return successCount
}
