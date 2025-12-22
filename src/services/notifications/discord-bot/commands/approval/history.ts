/**
 * Approval Command History
 *
 * History browser with filtering and pagination for the approval command.
 */

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

/**
 * Display a paginated, filterable view of approval history.
 *
 * Shows up to five approval items per page, renders a summary embed, adds item selection buttons,
 * filter buttons (All, Pending, Approved, Rejected, Expired, Auto-Approved), and pagination controls.
 *
 * @param page - Zero-based page index to display.
 * @param filter - Filter key: "all" for no filter, or one of
 *                 "pending" | "approved" | "rejected" | "expired" | "auto_approved".
 */
export async function showApprovalHistory(
  interaction: ButtonInteraction,
  page: number,
  filter: string,
  deps: HistoryDeps,
): Promise<void> {
  const { db, logger } = deps

  try {
    const pageSize = 5 // Reduced to fit button limits
    const fetchSize = pageSize + 1 // Fetch one extra to detect if more pages exist
    const offset = page * pageSize

    // Map filter to database status
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
        status = undefined // 'all'
    }

    // Get paginated history (fetch one extra to detect more pages)
    const approvals = await db.getApprovalHistory(
      undefined, // userId - get all users
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

    // Create history embed
    const historyEmbed = new EmbedBuilder()
      .setTitle(`📊 Approval History (Page ${page + 1})`)
      .setDescription(
        `Filter: **${filter.charAt(0).toUpperCase() + filter.slice(1)}**`,
      )
      .setColor(0x5865f2)

    // Add approval items as clickable buttons (max 5 per page to fit Discord limits)
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

    // Create clickable item buttons
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

    // Create navigation buttons
    const actionRows = []

    // Item selection buttons (if any items)
    if (itemButtons.length > 0) {
      const itemRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...itemButtons,
      )
      actionRows.push(itemRow)
    }

    // Filter buttons row 1 (All, Pending, Approved)
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

    // Filter buttons row 2 (Rejected, Expired, Auto-Approved)
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

    // Navigation buttons row
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

/**
 * Handle history-related actions (filter changes, page navigation)
 */
export async function handleHistoryAction(
  interaction: ButtonInteraction,
  parts: string[],
  deps: HistoryDeps,
): Promise<void> {
  const { logger } = deps

  await interaction.deferUpdate()

  try {
    const action = parts[2] // filter, page, etc.

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

/**
 * Handle individual item clicks from history
 */
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

/**
 * Display a detailed view for a single approval request from history.
 *
 * Shows request metadata, trigger reason, timestamps, and any approval action history,
 * then presents action buttons tailored to the approval's current status.
 *
 * @param returnPage - The history page number to return to when the user selects "Back to History"
 * @param returnFilter - The history filter identifier to preserve when returning to the history view
 */
export async function showItemDetail(
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

    // Add approval details if exists
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

    // Create action buttons based on current status
    const actionRows = []
    const actionRow = new ActionRowBuilder<ButtonBuilder>()

    // State transition rules:
    // - Pending: Approve/Reject/Delete
    // - Approved: Delete only (cannot reject once approved)
    // - Rejected: Approve/Delete (allows reversal)
    // - Expired: Delete only

    switch (approval.status) {
      case 'pending':
        actionRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`approval_approve_${approvalId}_0`) // Use 0 for index since we're not in review flow
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

    // Navigation row
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
