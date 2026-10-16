import type { ApprovalService } from '@services/approval.service.js'
import type { DatabaseService } from '@services/database.service.js'
import type { ButtonInteraction } from 'discord.js'
import { MessageFlags } from 'discord.js'
import type { FastifyBaseLogger } from 'fastify'
import { handleDeleteAction } from './delete-flow.js'
import { handleHistoryAction, handleItemAction } from './history.js'
import { handleMenuAction } from './menu.js'
import {
  handleApprovalAction,
  handleApprovalBack,
  handleApprovalDetails,
  handleNavigationAction,
} from './review-flow.js'

export interface HandlerDeps {
  db: DatabaseService
  approvalService: ApprovalService
  logger: FastifyBaseLogger
}

export async function handleApprovalButtons(
  interaction: ButtonInteraction,
  deps: HandlerDeps,
): Promise<void> {
  const { logger } = deps

  if (!interaction.customId.startsWith('approval_')) {
    return
  }

  const parts = interaction.customId.split('_')

  if (parts[1] === 'menu') {
    const menuAction = parts[2]
    await handleMenuAction(interaction, menuAction, deps)
    return
  }

  if (parts[1] === 'nav') {
    const direction = parts[2]
    const currentIndex = Number.parseInt(parts[3], 10)

    if (Number.isNaN(currentIndex)) {
      await interaction.reply({
        content: '❌ Invalid navigation index',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    await handleNavigationAction(interaction, direction, currentIndex, deps)
    return
  }

  if (parts[1] === 'history') {
    await handleHistoryAction(interaction, parts, deps)
    return
  }

  if (parts[1] === 'item') {
    await handleItemAction(interaction, parts, deps)
    return
  }

  if (parts[1] === 'delete') {
    await handleDeleteAction(interaction, parts, deps)
    return
  }

  const action = parts[1]
  const approvalIdStr = parts[2]
  const currentIndexStr = parts[3]

  const approvalId = Number.parseInt(approvalIdStr, 10)
  const currentIndex = Number.parseInt(currentIndexStr, 10)

  if (Number.isNaN(approvalId) || Number.isNaN(currentIndex)) {
    await interaction.reply({
      content: '❌ Invalid approval ID or index',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  try {
    switch (action) {
      case 'approve':
        await handleApprovalAction(
          interaction,
          approvalId,
          currentIndex,
          'approve',
          deps,
        )
        break
      case 'reject':
        await handleApprovalAction(
          interaction,
          approvalId,
          currentIndex,
          'reject',
          deps,
        )
        break
      case 'details':
        await handleApprovalDetails(interaction, approvalId, currentIndex, deps)
        break
      case 'back':
        await handleApprovalBack(interaction, approvalId, currentIndex, deps)
        break
      default:
        await interaction.reply({
          content: '❌ Unknown action',
          flags: MessageFlags.Ephemeral,
        })
    }
  } catch (error) {
    logger.error(
      { error, approvalId, currentIndex, action },
      'Error handling approval button',
    )

    const errorMessage =
      error instanceof Error ? error.message : 'An unknown error occurred'

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: `❌ Error: ${errorMessage}`,
        flags: MessageFlags.Ephemeral,
      })
    } else {
      await interaction.reply({
        content: `❌ Error: ${errorMessage}`,
        flags: MessageFlags.Ephemeral,
      })
    }
  }
}
