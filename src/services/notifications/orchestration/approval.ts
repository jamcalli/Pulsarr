/**
 * Approval Notification Orchestration
 *
 * Provides utilities for approval notification configuration and channel routing.
 * The ApprovalService handles batching/debouncing and uses these utilities for
 * determining which channels to notify.
 */

import type { DiscordEmbed } from '@root/types/discord.types.js'

// ============================================================================
// Types
// ============================================================================

export interface ApprovalRequest {
  id: number
  contentTitle: string
  contentType: 'movie' | 'show'
  contentKey: string
  userId: number
  userName: string | null
  triggeredBy: string
  approvalReason: string | null
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
// Embed Builders
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
 * Creates a Discord embed for a single approval request.
 */
export function createApprovalWebhookEmbed(
  request: ApprovalRequest,
  totalPending: number,
  posterUrl?: string,
): DiscordEmbed {
  const embed: DiscordEmbed = {
    title: 'Content Approval Required',
    description: `**${request.contentTitle}** (${request.contentType.charAt(0).toUpperCase() + request.contentType.slice(1)})`,
    color: 0xff9500,
    timestamp: new Date().toISOString(),
    fields: [
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
    ],
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
      name: '',
      value: '',
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
} {
  const contentType =
    request.contentType.charAt(0).toUpperCase() + request.contentType.slice(1)
  const requester = request.userName || `User ${request.userId}`
  const reason = formatTriggerReason(
    request.triggeredBy,
    request.approvalReason,
  )

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
  }
}
