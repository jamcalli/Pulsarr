/**
 * Approval Command Review Flow
 *
 * Handles the pending approval review flow including navigation,
 * approve/reject actions, and details view.
 */

import type { ApprovalRequest } from '@root/types/approval.types.js'
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
  log: FastifyBaseLogger
}

/**
 * Show approval at specific index with navigation
 */
export async function showApprovalAtIndex(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  currentIndex: number,
  allApprovals: ApprovalRequest[],
  deps: ReviewFlowDeps,
  ephemeral = false,
): Promise<void> {
  const { db, log } = deps

  const approval = allApprovals[currentIndex]
  if (!approval) {
    await interaction.reply({
      content: '❌ Approval not found',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // Get poster URL from watchlist items
  const posterUrl = await getPosterUrl(approval.contentKey, { db, log })

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

    log.debug(
      {
        userId: interaction.user.id,
        approvalId: approval.id,
        currentIndex,
        totalApprovals: allApprovals.length,
      },
      'Showed approval with navigation',
    )
  } catch (error) {
    log.error(
      { error, approvalId: approval.id, currentIndex },
      'Error showing approval message',
    )
    throw error
  }
}

/**
 * Handle navigation actions (back/next)
 */
export async function handleNavigationAction(
  interaction: ButtonInteraction,
  direction: string,
  currentIndex: number,
  deps: ReviewFlowDeps,
): Promise<void> {
  const { db, log } = deps

  await interaction.deferUpdate()

  try {
    // Get all pending approvals
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
    log.error({ error, direction, currentIndex }, 'Error handling navigation')
    await interaction.editReply('❌ Error navigating approvals')
  }
}

/**
 * Show loading state with disabled buttons
 */
async function showLoadingState(
  interaction: ButtonInteraction,
  action: 'approve' | 'reject',
  currentIndex: number,
  deps: ReviewFlowDeps,
): Promise<void> {
  const { db, log } = deps

  try {
    // Get the current approval info
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

    const posterUrl = await getPosterUrl(approval.contentKey, { db, log })
    const embed = createApprovalEmbed(
      approval,
      currentIndex,
      1, // Fake total count for loading state
      posterUrl,
    )

    const loadingActionRow = createLoadingActionRow(approvalId, action)

    await interaction.update({
      embeds: [embed],
      components: [loadingActionRow],
    })
  } catch (_error) {
    // Fallback to defer if update fails
    await interaction.deferUpdate()
  }
}

/**
 * Show success state with feedback
 */
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

/**
 * Show next approval after an action (approve/reject)
 */
async function showNextApprovalAfterAction(
  interaction: ButtonInteraction,
  currentIndex: number,
  deps: ReviewFlowDeps,
): Promise<void> {
  const { db, log } = deps

  try {
    // Get fresh list of pending approvals
    const pendingApprovals = await db.getPendingApprovalRequests()

    if (pendingApprovals.length === 0) {
      // No more approvals - show completion message
      const completionEmbed = createCompletionEmbed()

      await interaction.editReply({
        content: '',
        embeds: [completionEmbed],
        components: [createBackToMenuButton()],
      })
      return
    }

    // Show the same index or first if current was processed
    const nextIndex = Math.min(currentIndex, pendingApprovals.length - 1)
    await showApprovalAtIndex(interaction, nextIndex, pendingApprovals, deps)
  } catch (error) {
    log.error({ error, currentIndex }, 'Error showing next approval')
    await interaction.editReply('❌ Error loading next approval')
  }
}

/**
 * Handle approve/reject actions
 */
export async function handleApprovalAction(
  interaction: ButtonInteraction,
  approvalId: number,
  currentIndex: number,
  action: 'approve' | 'reject',
  deps: ReviewFlowDeps,
): Promise<void> {
  const { db, approvalService, log } = deps

  // Show loading state immediately
  await showLoadingState(interaction, action, currentIndex, deps)

  try {
    // Get approval request
    const approval = await db.getApprovalRequest(approvalId)
    if (!approval) {
      await interaction.editReply('❌ Approval request not found')
      return
    }

    const isReversalAllowed =
      approval.status === 'rejected' && action === 'approve'
    if (approval.status !== 'pending' && !isReversalAllowed) {
      const message =
        approval.status === 'auto_approved'
          ? '❌ This approval request was auto-approved and cannot be modified'
          : `❌ This approval request is already ${approval.status}`
      await interaction.editReply(message)
      return
    }

    // Get the admin user ID from Discord user
    const adminUser = await getAdminUserFromDiscord(interaction.user.id, {
      db,
      log,
    })
    if (!adminUser) {
      await interaction.editReply('❌ Could not identify admin user')
      return
    }

    // Process the approval/rejection using the EXACT same logic as API routes
    if (action === 'approve') {
      // Check instance health before approving
      const healthCheck = await approvalService.checkInstanceHealth(
        approval.contentType,
      )
      if (!healthCheck.available) {
        await interaction.editReply(
          `❌ Cannot process approval: ${healthCheck.unavailableType} instances are unavailable. Please try again later.`,
        )
        return
      }

      // Step 1: Approve the request (same as API route)
      const approvedRequest = await approvalService.approveRequest(
        approvalId,
        adminUser.id,
        'Approved via Discord',
      )

      if (!approvedRequest) {
        await interaction.editReply('❌ Failed to approve request')
        return
      }

      // Step 2: Process the approved request (same as API route)
      const result =
        await approvalService.processApprovedRequest(approvedRequest)

      if (!result.success) {
        await interaction.editReply(
          `❌ Approved but failed to process: ${result.error}`,
        )
        return
      }

      // Show success feedback
      await showSuccessState(interaction, 'approve', approval)
    } else {
      // Reject the request using the approval service (same as API route)
      const rejectedRequest = await approvalService.rejectRequest(
        approvalId,
        adminUser.id,
        'Rejected via Discord',
      )

      if (!rejectedRequest) {
        await interaction.editReply('❌ Failed to reject request')
        return
      }

      // Show success feedback
      await showSuccessState(interaction, 'reject', approval)
    }

    // Show next approval after a short delay
    setTimeout(() => {
      showNextApprovalAfterAction(interaction, currentIndex, deps).catch(
        (err) => deps.log.error({ err }, 'Failed to show next approval'),
      )
    }, 1500)
  } catch (error) {
    log.error({ error, approvalId, action }, 'Error processing approval action')
    await interaction.editReply(
      `❌ Error processing ${action}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}

/**
 * Show approval details view
 */
export async function handleApprovalDetails(
  interaction: ButtonInteraction,
  approvalId: number,
  currentIndex: number,
  deps: ReviewFlowDeps,
): Promise<void> {
  const { db, log } = deps

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
    log.error({ error, approvalId }, 'Error showing approval details')
    await interaction.editReply({
      content: '❌ Error loading approval details',
      embeds: [],
      components: [],
    })
  }
}

/**
 * Handle back button from details view
 */
export async function handleApprovalBack(
  interaction: ButtonInteraction,
  approvalId: number,
  currentIndex: number,
  deps: ReviewFlowDeps,
): Promise<void> {
  const { db, log } = deps

  await interaction.deferUpdate()

  try {
    // Get all pending approvals to restore navigation context
    const pendingApprovals = await db.getPendingApprovalRequests()

    if (pendingApprovals.length === 0) {
      await interaction.editReply({
        content: '✅ No pending approval requests found!',
        embeds: [],
        components: [],
      })
      return
    }

    // Find the current approval in the list
    const approvalIndex = pendingApprovals.findIndex((a) => a.id === approvalId)
    const indexToShow =
      approvalIndex >= 0
        ? approvalIndex
        : Math.min(currentIndex, pendingApprovals.length - 1)

    // Restore the original approval message with navigation
    await showApprovalAtIndex(interaction, indexToShow, pendingApprovals, deps)
  } catch (error) {
    log.error({ error, approvalId, currentIndex }, 'Error handling back button')
    await interaction.editReply({
      content: '❌ Error restoring approval view',
      embeds: [],
      components: [],
    })
  }
}
