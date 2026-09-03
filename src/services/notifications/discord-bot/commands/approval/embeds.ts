import type { ApprovalRequest } from '@root/types/approval.types.js'
import { getTmdbUrl } from '@root/utils/guid-handler.js'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js'

export function formatTriggerReason(
  trigger: string,
  reason: string | null,
): string {
  const triggerMap: Record<string, string> = {
    manual_flag: '🚩 Manual Flag',
    quota_exceeded: '📊 Quota Exceeded',
    user_request: '👤 User Request',
    system_flag: '🤖 System Flag',
  }

  const triggerText = triggerMap[trigger] || `🔍 ${trigger}`
  return reason ? `${triggerText}\n${reason}` : triggerText
}

export function createBackToMenuButton(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('approval_menu_main')
      .setLabel('← Back to Menu')
      .setStyle(ButtonStyle.Secondary),
  )
}

export function createMainMenuEmbed(
  pendingCount: number,
  totalCount: number,
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('📋 Approval Management')
    .setDescription('Choose an option to manage approval requests')
    .setColor(0x5865f2)
    .addFields([
      {
        name: '📊 Status Overview',
        value: `**${pendingCount}** pending requests\n**${totalCount}** total requests`,
        inline: false,
      },
    ])
    .setTimestamp()
}

export function createMainMenuActionRow(
  pendingCount: number,
  totalCount: number,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('approval_menu_pending')
      .setLabel(`📥 Review Pending (${pendingCount})`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(pendingCount === 0),
    new ButtonBuilder()
      .setCustomId('approval_menu_history')
      .setLabel('📊 View History')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(totalCount === 0),
    new ButtonBuilder()
      .setCustomId('approval_menu_exit')
      .setLabel('❌ Close')
      .setStyle(ButtonStyle.Secondary),
  )
}

export function createApprovalEmbed(
  approval: ApprovalRequest,
  currentIndex: number,
  totalCount: number,
  posterUrl?: string,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`${approval.contentTitle}`)
    .setColor(0xff9500)
    .addFields([
      {
        name: 'Request Information',
        value: [
          `**User:** ${approval.userName || `User ${approval.userId}`}`,
          `**Created:** ${new Date(approval.createdAt).toLocaleDateString(
            'en-US',
            {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            },
          )}`,
          `**Content Type:** ${approval.contentType}`,
          `**Triggered By:** ${formatTriggerReason(approval.triggeredBy, approval.approvalReason || null)}`,
          approval.expiresAt
            ? `**Expires:** ${new Date(approval.expiresAt).toLocaleDateString(
                'en-US',
                {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                },
              )}`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
        inline: false,
      },
    ])

  if (approval.contentGuids && approval.contentGuids.length > 0) {
    embed.addFields([
      {
        name: 'Content GUIDs',
        value: approval.contentGuids.join(', '),
        inline: false,
      },
    ])
  }

  const mediaType = approval.contentType === 'show' ? 'show' : 'movie'
  const tmdbUrl = getTmdbUrl(approval.contentGuids, mediaType)
  if (tmdbUrl) {
    embed.addFields([
      {
        name: 'More Info',
        value: `[View on TMDB](${tmdbUrl})`,
        inline: true,
      },
    ])
  }

  embed.setFooter({
    text: `Approval ${currentIndex + 1} of ${totalCount} • Status: ${approval.status.toUpperCase()} • ID: ${approval.id}`,
  })

  if (posterUrl) {
    embed.setImage(posterUrl)
  }

  return embed
}

export function createApprovalActionRows(
  approval: ApprovalRequest,
  currentIndex: number,
  totalCount: number,
): ActionRowBuilder<ButtonBuilder>[] {
  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`approval_approve_${approval.id}_${currentIndex}`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`approval_reject_${approval.id}_${currentIndex}`)
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`approval_details_${approval.id}_${currentIndex}`)
      .setLabel('Details')
      .setStyle(ButtonStyle.Secondary),
  )

  const navigationRow = new ActionRowBuilder<ButtonBuilder>()

  if (currentIndex > 0) {
    navigationRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`approval_nav_back_${currentIndex}`)
        .setLabel('← Back')
        .setStyle(ButtonStyle.Secondary),
    )
  }

  if (currentIndex < totalCount - 1) {
    navigationRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`approval_nav_next_${currentIndex}`)
        .setLabel('Next →')
        .setStyle(ButtonStyle.Secondary),
    )
  }

  navigationRow.addComponents(
    new ButtonBuilder()
      .setCustomId('approval_menu_main')
      .setLabel('← Menu')
      .setStyle(ButtonStyle.Secondary),
  )

  const actionRows = [actionRow]
  if (navigationRow.components.length > 0) {
    actionRows.push(navigationRow)
  }

  return actionRows
}

export function createLoadingActionRow(
  approvalId: number,
  action: 'approve' | 'reject',
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`loading_approve_${approvalId}`)
      .setLabel(action === 'approve' ? 'Approving...' : 'Approve')
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`loading_reject_${approvalId}`)
      .setLabel(action === 'reject' ? 'Rejecting...' : 'Reject')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`loading_details_${approvalId}`)
      .setLabel('Details')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
  )
}

export function createSuccessEmbed(
  action: 'approve' | 'reject',
  contentTitle: string,
): EmbedBuilder {
  const actionText = action === 'approve' ? 'Approved' : 'Rejected'
  const emoji = action === 'approve' ? '✅' : '❌'

  return new EmbedBuilder()
    .setTitle(`${emoji} ${actionText}`)
    .setDescription(`**${contentTitle}** has been ${actionText.toLowerCase()}`)
    .setColor(action === 'approve' ? 0x57f287 : 0xed4245)
    .setTimestamp()
}

export function createCompletionEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('✅ All Approvals Processed')
    .setDescription('No more pending approval requests!')
    .setColor(0x57f287)
    .setTimestamp()
}

export function createDetailsEmbed(approval: ApprovalRequest): EmbedBuilder {
  const detailsEmbed = new EmbedBuilder()
    .setTitle(`${approval.contentTitle} - Detailed View`)
    .setColor(0x5865f2)
    .addFields([
      {
        name: 'Request Information',
        value: [
          `**User:** ${approval.userName || `User ${approval.userId}`}`,
          `**Created:** ${new Date(approval.createdAt).toLocaleDateString(
            'en-US',
            {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            },
          )}`,
          `**Content Type:** ${approval.contentType}`,
          `**Triggered By:** ${formatTriggerReason(approval.triggeredBy, approval.approvalReason || null)}`,
          approval.expiresAt
            ? `**Expires:** ${new Date(approval.expiresAt).toLocaleDateString(
                'en-US',
                {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                },
              )}`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
        inline: false,
      },
    ])

  if (approval.contentGuids && approval.contentGuids.length > 0) {
    detailsEmbed.addFields([
      {
        name: 'Content GUIDs',
        value: approval.contentGuids.join('\n'),
        inline: false,
      },
    ])
  }

  const mediaType = approval.contentType === 'show' ? 'show' : 'movie'
  const tmdbUrl = getTmdbUrl(approval.contentGuids, mediaType)
  if (tmdbUrl) {
    detailsEmbed.addFields([
      {
        name: 'More Info',
        value: `[View on TMDB](${tmdbUrl})`,
        inline: true,
      },
    ])
  }

  if (approval.proposedRouterDecision?.approval?.proposedRouting) {
    const routing = approval.proposedRouterDecision.approval.proposedRouting
    const routingDetails = []

    routingDetails.push(
      `**Instance:** ${routing.instanceType} Instance ${routing.instanceId}`,
    )

    if (routing.qualityProfile) {
      routingDetails.push(`**Quality Profile:** ${routing.qualityProfile}`)
    }

    if (routing.rootFolder) {
      routingDetails.push(`**Root Folder:** ${routing.rootFolder}`)
    }

    if (routing.searchOnAdd !== undefined) {
      routingDetails.push(
        `**Search on Add:** ${routing.searchOnAdd ? 'Yes' : 'No'}`,
      )
      if (routing.searchOnAdd) {
        routingDetails.push(
          `└ Automatically search for ${approval.contentType === 'show' ? 'episodes' : 'movies'}`,
        )
      }
    }

    if (routing.seasonMonitoring) {
      routingDetails.push(`**Season Monitoring:** ${routing.seasonMonitoring}`)
    }
    if (routing.seriesType) {
      routingDetails.push(`**Series Type:** ${routing.seriesType}`)
    }

    if (routing.minimumAvailability) {
      routingDetails.push(
        `**Minimum Availability:** ${routing.minimumAvailability}`,
      )
    }

    if (routing.tags && routing.tags.length > 0) {
      routingDetails.push(`**Tags:** ${routing.tags.join(', ')}`)
    } else {
      routingDetails.push('**Tags:** None')
    }

    if (routing.priority !== undefined) {
      routingDetails.push(`**Priority:** ${routing.priority}`)
    }

    detailsEmbed.addFields([
      {
        name: 'Full Proposed Routing',
        value: routingDetails.join('\n'),
        inline: false,
      },
    ])
  } else {
    detailsEmbed.addFields([
      {
        name: 'Proposed Routing',
        value: 'No routing information available',
        inline: false,
      },
    ])
  }

  if (approval.approvalNotes || approval.approvedBy) {
    const historyDetails = []
    if (approval.approvedBy) {
      historyDetails.push(`**Approved By:** User ${approval.approvedBy}`)
    }
    if (approval.approvalNotes) {
      historyDetails.push(`**Notes:** ${approval.approvalNotes}`)
    }

    detailsEmbed.addFields([
      {
        name: 'Approval History',
        value: historyDetails.join('\n'),
        inline: false,
      },
    ])
  }

  return detailsEmbed
}

export function createDetailsActionRow(
  approvalId: number,
  currentIndex: number,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`approval_back_${approvalId}_${currentIndex}`)
      .setLabel('← Back')
      .setStyle(ButtonStyle.Secondary),
  )
}

export function getStatusEmoji(status: ApprovalRequest['status']): string {
  const emojiMap: Record<string, string> = {
    pending: '⏳',
    approved: '✅',
    rejected: '❌',
    expired: '⏰',
    auto_approved: '🤖',
  }
  return emojiMap[status] || '❓'
}

export function getStatusColor(status: ApprovalRequest['status']): number {
  const colorMap: Record<string, number> = {
    pending: 0xfee75c,
    approved: 0x57f287,
    rejected: 0xed4245,
    expired: 0x6c757d,
    auto_approved: 0x00d4aa,
  }
  return colorMap[status] || 0x5865f2
}
