import type { ApprovalRequest } from '@root/types/approval.types.js'
import type { DatabaseService } from '@services/database.service.js'
import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js'
import type { FastifyBaseLogger } from 'fastify'
import {
  createBackToMenuButton,
  formatTriggerReason,
  getStatusColor,
  getStatusEmoji,
} from './embeds.js'

export interface HistoryDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
}

export async function showApprovalHistory(
  interaction: ButtonInteraction,
  page: number,
  filter: string,
  deps: HistoryDeps,
): Promise<void> {
  const { db, logger } = deps

  try {
    const pageSize = 5 // Discord caps an action row at five buttons
    const fetchSize = pageSize + 1 // The extra row reveals whether a next page exists
    const offset = page * pageSize

    let status: ApprovalRequest['status'] | undefined
    switch (filter) {
      case 'pending':
        status = 'pending'
        break
      case 'approved':
        status = 'approved'
        break
      case 'rejected':
        status = 'rejected'
        break
      case 'expired':
        status = 'expired'
        break
      case 'auto_approved':
        status = 'auto_approved'
        break
      default:
        status = undefined
    }

    const approvals = await db.getApprovalHistory(
      undefined,
      status,
      fetchSize,
      offset,
    )
    const hasMorePages = approvals.length > pageSize

    if (approvals.length === 0 && page === 0) {
      await interaction.editReply({
        content: '📋 No approval history found',
        embeds: [],
        components: [createBackToMenuButton()],
      })
      return
    }

    const historyEmbed = new EmbedBuilder()
      .setTitle(`📊 Approval History (Page ${page + 1})`)
      .setDescription(
        `Filter: **${filter.charAt(0).toUpperCase() + filter.slice(1)}**`,
      )
      .setColor(0x5865f2)

    const displayApprovals = approvals.slice(0, 5)

    for (const approval of displayApprovals) {
      const statusEmoji = getStatusEmoji(approval.status)
      const contentType =
        approval.contentType.charAt(0).toUpperCase() +
        approval.contentType.slice(1)

      historyEmbed.addFields({
        name: `${statusEmoji} ${approval.contentTitle}`,
        value: `${contentType} • ${approval.userName || `User ${approval.userId}`} • ID: ${approval.id}`,
        inline: false,
      })
    }

    const itemButtons = []
    for (let i = 0; i < displayApprovals.length; i++) {
      const approval = displayApprovals[i]
      itemButtons.push(
        new ButtonBuilder()
          .setCustomId(`approval_item_${approval.id}_${page}_${filter}`)
          .setLabel(
            `${i + 1}. ${approval.contentTitle.substring(0, 20)}${approval.contentTitle.length > 20 ? '...' : ''}`,
          )
          .setStyle(ButtonStyle.Secondary),
      )
    }

    const actionRows = []

    if (itemButtons.length > 0) {
      const itemRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...itemButtons,
      )
      actionRows.push(itemRow)
    }

    const filterRow1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('approval_history_filter_all')
        .setLabel('All')
        .setStyle(
          filter === 'all' ? ButtonStyle.Primary : ButtonStyle.Secondary,
        ),
      new ButtonBuilder()
        .setCustomId('approval_history_filter_pending')
        .setLabel('Pending')
        .setStyle(
          filter === 'pending' ? ButtonStyle.Primary : ButtonStyle.Secondary,
        ),
      new ButtonBuilder()
        .setCustomId('approval_history_filter_approved')
        .setLabel('Approved')
        .setStyle(
          filter === 'approved' ? ButtonStyle.Primary : ButtonStyle.Secondary,
        ),
    )
    actionRows.push(filterRow1)

    const filterRow2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('approval_history_filter_rejected')
        .setLabel('Rejected')
        .setStyle(
          filter === 'rejected' ? ButtonStyle.Primary : ButtonStyle.Secondary,
        ),
      new ButtonBuilder()
        .setCustomId('approval_history_filter_expired')
        .setLabel('Expired')
        .setStyle(
          filter === 'expired' ? ButtonStyle.Primary : ButtonStyle.Secondary,
        ),
      new ButtonBuilder()
        .setCustomId('approval_history_filter_auto_approved')
        .setLabel('Auto-Approved')
        .setStyle(
          filter === 'auto_approved'
            ? ButtonStyle.Primary
            : ButtonStyle.Secondary,
        ),
    )
    actionRows.push(filterRow2)

    const navRow = new ActionRowBuilder<ButtonBuilder>()

    if (page > 0) {
      navRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`approval_history_page_${page - 1}_${filter}`)
          .setLabel('← Previous')
          .setStyle(ButtonStyle.Secondary),
      )
    }

    if (hasMorePages) {
      navRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`approval_history_page_${page + 1}_${filter}`)
          .setLabel('Next →')
          .setStyle(ButtonStyle.Secondary),
      )
    }

    navRow.addComponents(
      new ButtonBuilder()
        .setCustomId('approval_menu_main')
        .setLabel('← Back to Menu')
        .setStyle(ButtonStyle.Secondary),
    )

    if (navRow.components.length > 0) {
      actionRows.push(navRow)
    }

    await interaction.editReply({
      content: '',
      embeds: [historyEmbed],
      components: actionRows,
    })
  } catch (error) {
    logger.error({ error, page, filter }, 'Error showing approval history')
    await interaction.editReply('❌ Error loading approval history')
  }
}

export async function handleHistoryAction(
  interaction: ButtonInteraction,
  parts: string[],
  deps: HistoryDeps,
): Promise<void> {
  const { logger } = deps

  await interaction.deferUpdate()

  try {
    const action = parts[2]

    if (action === 'filter') {
      const filter = parts.slice(3).join('_') || 'all'
      await showApprovalHistory(interaction, 0, filter, deps)
    } else if (action === 'page') {
      const page = Number.parseInt(parts[3], 10)
      const filter = parts.slice(4).join('_') || 'all'
      await showApprovalHistory(interaction, page, filter, deps)
    }
  } catch (error) {
    logger.error({ error, parts }, 'Error handling history action')
    await interaction.editReply('❌ Error processing history action')
  }
}

export async function handleItemAction(
  interaction: ButtonInteraction,
  parts: string[],
  deps: HistoryDeps,
): Promise<void> {
  const { logger } = deps

  await interaction.deferUpdate()

  try {
    const approvalId = Number.parseInt(parts[2], 10)
    const returnPage = Number.parseInt(parts[3], 10)
    const returnFilter = parts.slice(4).join('_') || 'all'

    if (Number.isNaN(approvalId)) {
      await interaction.editReply('❌ Invalid approval ID')
      return
    }

    await showItemDetail(
      interaction,
      approvalId,
      returnPage,
      returnFilter,
      deps,
    )
  } catch (error) {
    logger.error({ error, parts }, 'Error handling item action')
    await interaction.editReply('❌ Error processing item action')
  }
}

async function showItemDetail(
  interaction: ButtonInteraction,
  approvalId: number,
  returnPage: number,
  returnFilter: string,
  deps: HistoryDeps,
): Promise<void> {
  const { db, logger } = deps

  try {
    const approval = await db.getApprovalRequest(approvalId)
    if (!approval) {
      await interaction.editReply({
        content: '❌ Approval request not found',
        embeds: [],
        components: [createBackToMenuButton()],
      })
      return
    }

    const statusEmoji = getStatusEmoji(approval.status)
    const statusColor = getStatusColor(approval.status)

    const detailEmbed = new EmbedBuilder()
      .setTitle(`${statusEmoji} ${approval.contentTitle}`)
      .setDescription(
        `**${approval.status.charAt(0).toUpperCase() + approval.status.slice(1)}** approval request`,
      )
      .setColor(statusColor)
      .addFields([
        {
          name: '📋 Request Details',
          value: [
            `**Content:** ${approval.contentTitle}`,
            `**Type:** ${approval.contentType.charAt(0).toUpperCase() + approval.contentType.slice(1)}`,
            `**Requested by:** ${approval.userName || `User ${approval.userId}`}`,
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
          ].join('\n'),
          inline: false,
        },
        {
          name: '🔍 Trigger Reason',
          value: formatTriggerReason(
            approval.triggeredBy,
            approval.approvalReason || null,
          ),
          inline: false,
        },
      ])
      .setFooter({ text: `ID: ${approval.id}` })
      .setTimestamp()

    if (approval.approvedBy || approval.approvalNotes) {
      const approvalDetails = []
      if (approval.approvedBy) {
        approvalDetails.push(`**Action by:** User ${approval.approvedBy}`)
      }
      if (approval.approvalNotes) {
        approvalDetails.push(`**Notes:** ${approval.approvalNotes}`)
      }

      detailEmbed.addFields({
        name: '📝 Action History',
        value: approvalDetails.join('\n'),
        inline: false,
      })
    }

    const actionRows = []
    const actionRow = new ActionRowBuilder<ButtonBuilder>()

    switch (approval.status) {
      case 'pending':
        actionRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`approval_approve_${approvalId}_0`) // History items sit outside the review flow, so the index is 0
            .setLabel('✅ Approve')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`approval_reject_${approvalId}_0`)
            .setLabel('❌ Reject')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(
              `approval_delete_confirm_${approvalId}_${returnPage}_${returnFilter}`,
            )
            .setLabel('🗑️ Delete')
            .setStyle(ButtonStyle.Secondary),
        )
        break

      case 'rejected':
        actionRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`approval_approve_${approvalId}_0`)
            .setLabel('✅ Approve')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(
              `approval_delete_confirm_${approvalId}_${returnPage}_${returnFilter}`,
            )
            .setLabel('🗑️ Delete')
            .setStyle(ButtonStyle.Secondary),
        )
        break

      case 'approved':
      case 'auto_approved':
      case 'expired':
        actionRow.addComponents(
          new ButtonBuilder()
            .setCustomId(
              `approval_delete_confirm_${approvalId}_${returnPage}_${returnFilter}`,
            )
            .setLabel('🗑️ Delete')
            .setStyle(ButtonStyle.Danger),
        )
        break

      default:
        logger.warn(
          { status: approval.status, approvalId },
          'Unexpected approval status in item detail',
        )
        actionRow.addComponents(
          new ButtonBuilder()
            .setCustomId(
              `approval_delete_confirm_${approvalId}_${returnPage}_${returnFilter}`,
            )
            .setLabel('🗑️ Delete')
            .setStyle(ButtonStyle.Danger),
        )
    }

    if (actionRow.components.length > 0) {
      actionRows.push(actionRow)
    }

    const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`approval_history_page_${returnPage}_${returnFilter}`)
        .setLabel('← Back to History')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('approval_menu_main')
        .setLabel('← Back to Menu')
        .setStyle(ButtonStyle.Secondary),
    )
    actionRows.push(navRow)

    await interaction.editReply({
      content: '',
      embeds: [detailEmbed],
      components: actionRows,
    })

    logger.debug(
      {
        userId: interaction.user.id,
        approvalId,
        status: approval.status,
      },
      'Showed individual approval item detail',
    )
  } catch (error) {
    logger.error({ error, approvalId }, 'Error showing item detail')
    await interaction.editReply('❌ Error loading item details')
  }
}
