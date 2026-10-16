import type { ApprovalRequest } from '@root/types/approval.types.js'
import { canTransitionApproval } from '@schemas/approval/approval.schema.js'
import type { ApprovalService } from '@services/approval.service.js'
import type { DatabaseService } from '@services/database.service.js'
import type { ButtonInteraction, ChatInputCommandInteraction } from 'discord.js'
import { MessageFlags } from 'discord.js'
import type { FastifyBaseLogger } from 'fastify'
import { getAdminUserFromDiscord, getPosterUrl } from './data.js'
import {
  createApprovalActionRows,
  createApprovalEmbed,
  createBackToMenuButton,
  createCompletionEmbed,
  createDetailsActionRow,
  createDetailsEmbed,
  createLoadingActionRow,
  createSuccessEmbed,
} from './embeds.js'

export interface ReviewFlowDeps {
  db: DatabaseService
  approvalService: ApprovalService
  logger: FastifyBaseLogger
}

export async function showApprovalAtIndex(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  currentIndex: number,
  allApprovals: ApprovalRequest[],
  deps: ReviewFlowDeps,
  ephemeral = false,
): Promise<void> {
  const { db, logger } = deps

  const approval = allApprovals[currentIndex]
  if (!approval) {
    await interaction.reply({
      content: '❌ Approval not found',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const posterUrl = await getPosterUrl(approval.contentKey, { db, logger })

  const embed = createApprovalEmbed(
    approval,
    currentIndex,
    allApprovals.length,
    posterUrl,
  )
  const actionRows = createApprovalActionRows(
    approval,
    currentIndex,
    allApprovals.length,
  )

  try {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        embeds: [embed],
        components: actionRows,
        ...(ephemeral && { flags: MessageFlags.Ephemeral }),
      })
    } else {
      await interaction.editReply({
        content: '',
        embeds: [embed],
        components: actionRows,
      })
    }

    logger.debug(
      {
        userId: interaction.user.id,
        approvalId: approval.id,
        currentIndex,
        totalApprovals: allApprovals.length,
      },
      'Showed approval with navigation',
    )
  } catch (error) {
    logger.error(
      { error, approvalId: approval.id, currentIndex },
      'Error showing approval message',
    )
    throw error
  }
}

export async function handleNavigationAction(
  interaction: ButtonInteraction,
  direction: string,
  currentIndex: number,
  deps: ReviewFlowDeps,
): Promise<void> {
  const { db, logger } = deps

  await interaction.deferUpdate()

  try {
    const pendingApprovals = await db.getPendingApprovalRequests()

    if (pendingApprovals.length === 0) {
      await interaction.editReply({
        content: '✅ No pending approval requests found!',
        embeds: [],
        components: [],
      })
      return
    }

    let newIndex = currentIndex
    if (direction === 'back' && currentIndex > 0) {
      newIndex = currentIndex - 1
    } else if (
      direction === 'next' &&
      currentIndex < pendingApprovals.length - 1
    ) {
      newIndex = currentIndex + 1
    }

    await showApprovalAtIndex(interaction, newIndex, pendingApprovals, deps)
  } catch (error) {
    logger.error(
      { error, direction, currentIndex },
      'Error handling navigation',
    )
    await interaction.editReply('❌ Error navigating approvals')
  }
}

async function showLoadingState(
  interaction: ButtonInteraction,
  action: 'approve' | 'reject',
  currentIndex: number,
  deps: ReviewFlowDeps,
): Promise<void> {
  const { db, logger } = deps

  try {
    const parts = interaction.customId.split('_')
    const approvalId = Number.parseInt(parts[2], 10)
    const approval = await db.getApprovalRequest(approvalId)

    if (!approval) {
      await interaction.reply({
        content: '❌ Approval not found',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    const posterUrl = await getPosterUrl(approval.contentKey, { db, logger })
    const embed = createApprovalEmbed(
      approval,
      currentIndex,
      1, // The loading embed never shows the real total
      posterUrl,
    )

    const loadingActionRow = createLoadingActionRow(approvalId, action)

    await interaction.update({
      embeds: [embed],
      components: [loadingActionRow],
    })
  } catch (_error) {
    await interaction.deferUpdate()
  }
}

async function showSuccessState(
  interaction: ButtonInteraction,
  action: 'approve' | 'reject',
  approval: ApprovalRequest,
): Promise<void> {
  const successEmbed = createSuccessEmbed(action, approval.contentTitle)

  await interaction.editReply({
    content: '',
    embeds: [successEmbed],
    components: [],
  })
}

async function showNextApprovalAfterAction(
  interaction: ButtonInteraction,
  currentIndex: number,
  deps: ReviewFlowDeps,
): Promise<void> {
  const { db, logger } = deps

  try {
    const pendingApprovals = await db.getPendingApprovalRequests()

    if (pendingApprovals.length === 0) {
      const completionEmbed = createCompletionEmbed()

      await interaction.editReply({
        content: '',
        embeds: [completionEmbed],
        components: [createBackToMenuButton()],
      })
      return
    }

    const nextIndex = Math.min(currentIndex, pendingApprovals.length - 1)
    await showApprovalAtIndex(interaction, nextIndex, pendingApprovals, deps)
  } catch (error) {
    logger.error({ error, currentIndex }, 'Error showing next approval')
    await interaction.editReply('❌ Error loading next approval')
  }
}

export async function handleApprovalAction(
  interaction: ButtonInteraction,
  approvalId: number,
  currentIndex: number,
  action: 'approve' | 'reject',
  deps: ReviewFlowDeps,
): Promise<void> {
  const { db, approvalService, logger } = deps

  await showLoadingState(interaction, action, currentIndex, deps)

  try {
    const approval = await db.getApprovalRequest(approvalId)
    if (!approval) {
      await interaction.editReply('❌ Approval request not found')
      return
    }

    if (
      !canTransitionApproval(
        approval.status,
        action === 'approve' ? 'approved' : 'rejected',
      )
    ) {
      const message =
        approval.status === 'auto_approved'
          ? '❌ This approval request was auto-approved and cannot be modified'
          : `❌ This approval request is already ${approval.status}`
      await interaction.editReply(message)
      return
    }

    const adminUser = await getAdminUserFromDiscord(interaction.user.id, {
      db,
      logger,
    })
    if (!adminUser) {
      await interaction.editReply('❌ Could not identify admin user')
      return
    }

    if (action === 'approve') {
      const healthCheck = await approvalService.checkInstanceHealth(
        approval.contentType,
      )
      if (!healthCheck.available) {
        await interaction.editReply(
          `❌ Cannot process approval: ${healthCheck.unavailableType} instances are unavailable. Please try again later.`,
        )
        return
      }

      const result = await approvalService.approveAndRoute(
        approvalId,
        adminUser.id,
        'Approved via Discord',
      )

      if (!result.success) {
        if (result.rollbackFailed) {
          await interaction.editReply(
            '❌ Routing failed and so did the rollback, so this request may be in an inconsistent state',
          )
        } else {
          await interaction.editReply(
            `❌ Failed to process approval: ${result.error}`,
          )
        }
        return
      }

      await showSuccessState(interaction, 'approve', approval)
    } else {
      const rejectedRequest = await approvalService.rejectRequest(
        approvalId,
        adminUser.id,
        'Rejected via Discord',
      )

      if (!rejectedRequest) {
        await interaction.editReply('❌ Failed to reject request')
        return
      }

      await showSuccessState(interaction, 'reject', approval)
    }

    setTimeout(() => {
      showNextApprovalAfterAction(interaction, currentIndex, deps).catch(
        (err) => deps.logger.error({ err }, 'Failed to show next approval'),
      )
    }, 1500)
  } catch (error) {
    logger.error(
      { error, approvalId, action },
      'Error processing approval action',
    )
    await interaction.editReply(
      `❌ Error processing ${action}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}

export async function handleApprovalDetails(
  interaction: ButtonInteraction,
  approvalId: number,
  currentIndex: number,
  deps: ReviewFlowDeps,
): Promise<void> {
  const { db, logger } = deps

  await interaction.deferUpdate()

  try {
    const approval = await db.getApprovalRequest(approvalId)
    if (!approval) {
      await interaction.editReply({
        content: '❌ Approval request not found',
        embeds: [],
        components: [],
      })
      return
    }

    const detailsEmbed = createDetailsEmbed(approval)
    const actionRow = createDetailsActionRow(approvalId, currentIndex)

    await interaction.editReply({
      content: '',
      embeds: [detailsEmbed],
      components: [actionRow],
    })
  } catch (error) {
    logger.error({ error, approvalId }, 'Error showing approval details')
    await interaction.editReply({
      content: '❌ Error loading approval details',
      embeds: [],
      components: [],
    })
  }
}

export async function handleApprovalBack(
  interaction: ButtonInteraction,
  approvalId: number,
  currentIndex: number,
  deps: ReviewFlowDeps,
): Promise<void> {
  const { db, logger } = deps

  await interaction.deferUpdate()

  try {
    const pendingApprovals = await db.getPendingApprovalRequests()

    if (pendingApprovals.length === 0) {
      await interaction.editReply({
        content: '✅ No pending approval requests found!',
        embeds: [],
        components: [],
      })
      return
    }

    const approvalIndex = pendingApprovals.findIndex((a) => a.id === approvalId)
    const indexToShow =
      approvalIndex >= 0
        ? approvalIndex
        : Math.min(currentIndex, pendingApprovals.length - 1)

    await showApprovalAtIndex(interaction, indexToShow, pendingApprovals, deps)
  } catch (error) {
    logger.error(
      { error, approvalId, currentIndex },
      'Error handling back button',
    )
    await interaction.editReply({
      content: '❌ Error restoring approval view',
      embeds: [],
      components: [],
    })
  }
}
