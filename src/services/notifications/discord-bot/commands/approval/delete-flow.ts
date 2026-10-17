import type { ApprovalService } from '@services/approval.service.js'
import type { DatabaseService } from '@services/database.service.js'
import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js'
import type { FastifyBaseLogger } from 'fastify'
import { createBackToMenuButton } from './embeds.js'

export interface DeleteFlowDeps {
  db: DatabaseService
  approvalService: ApprovalService
  logger: FastifyBaseLogger
}

export async function handleDeleteAction(
  interaction: ButtonInteraction,
  parts: string[],
  deps: DeleteFlowDeps,
): Promise<void> {
  const { logger } = deps

  await interaction.deferUpdate()

  try {
    const action = parts[2]
    const approvalId = Number.parseInt(parts[3], 10)

    if (Number.isNaN(approvalId)) {
      await interaction.editReply('❌ Invalid approval ID')
      return
    }

    if (action === 'confirm') {
      const returnPage = Number.parseInt(parts[4], 10) || 0
      const returnFilter = parts.slice(5).join('_') || 'all'
      await showDeleteConfirmation(
        interaction,
        approvalId,
        returnPage,
        returnFilter,
        deps,
      )
    } else if (action === 'execute') {
      const returnPage = Number.parseInt(parts[4], 10) || 0
      const returnFilter = parts.slice(5).join('_') || 'all'
      await executeDelete(
        interaction,
        approvalId,
        returnPage,
        returnFilter,
        deps,
      )
    }
  } catch (error) {
    logger.error({ error, parts }, 'Error handling delete action')
    await interaction.editReply('❌ Error processing delete action')
  }
}

async function showDeleteConfirmation(
  interaction: ButtonInteraction,
  approvalId: number,
  returnPage: number,
  returnFilter: string,
  deps: DeleteFlowDeps,
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

    const confirmEmbed = new EmbedBuilder()
      .setTitle('🗑️ Delete Approval Request?')
      .setDescription('This will permanently delete this approval request.')
      .setColor(0xed4245)
      .addFields([
        {
          name: '⚠️ Request to Delete',
          value: [
            `**Content:** ${approval.contentTitle}`,
            `**Type:** ${approval.contentType.charAt(0).toUpperCase() + approval.contentType.slice(1)}`,
            `**Status:** ${approval.status.charAt(0).toUpperCase() + approval.status.slice(1)}`,
            `**Requested by:** ${approval.userName || `User ${approval.userId}`}`,
          ].join('\n'),
          inline: false,
        },
      ])
      .setFooter({ text: 'This action cannot be undone!' })

    const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `approval_delete_execute_${approvalId}_${returnPage}_${returnFilter}`,
        )
        .setLabel('🗑️ DELETE')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(
          `approval_item_${approvalId}_${returnPage}_${returnFilter}`,
        )
        .setLabel('❌ Cancel')
        .setStyle(ButtonStyle.Secondary),
    )

    await interaction.editReply({
      content: '',
      embeds: [confirmEmbed],
      components: [confirmRow],
    })

    logger.debug(
      {
        userId: interaction.user.id,
        approvalId,
      },
      'Showed delete confirmation for approval request',
    )
  } catch (error) {
    logger.error({ error, approvalId }, 'Error showing delete confirmation')
    await interaction.editReply('❌ Error loading delete confirmation')
  }
}

async function executeDelete(
  interaction: ButtonInteraction,
  approvalId: number,
  returnPage: number,
  returnFilter: string,
  deps: DeleteFlowDeps,
): Promise<void> {
  const { db, approvalService, logger } = deps

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

    const deleted = await approvalService.deleteApprovalRequest(approvalId)

    if (!deleted) {
      await interaction.editReply({
        content: '❌ Failed to delete approval request',
        embeds: [],
        components: [createBackToMenuButton()],
      })
      return
    }

    const successEmbed = new EmbedBuilder()
      .setTitle('🗑️ Deleted')
      .setDescription(
        `**${approval.contentTitle}** has been permanently deleted`,
      )
      .setColor(0x57f287)
      .setTimestamp()

    const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`approval_history_page_${returnPage}_${returnFilter}`)
        .setLabel('← Back to History')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('approval_menu_main')
        .setLabel('← Back to Menu')
        .setStyle(ButtonStyle.Secondary),
    )

    await interaction.editReply({
      content: '',
      embeds: [successEmbed],
      components: [backRow],
    })

    logger.info(
      {
        userId: interaction.user.id,
        approvalId,
        contentTitle: approval.contentTitle,
        status: approval.status,
      },
      'Successfully deleted approval request',
    )
  } catch (error) {
    logger.error({ error, approvalId }, 'Error executing delete')
    await interaction.editReply('❌ Error deleting approval request')
  }
}
