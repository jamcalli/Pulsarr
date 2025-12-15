/**
 * Approval Command Menu
 *
 * Main menu display and menu action handling for the approval command.
 */

import type { ApprovalService } from '@services/approval.service.js'
import type { DatabaseService } from '@services/database.service.js'
import type { ButtonInteraction, ChatInputCommandInteraction } from 'discord.js'
import { MessageFlags } from 'discord.js'
import type { FastifyBaseLogger } from 'fastify'
import { createMainMenuActionRow, createMainMenuEmbed } from './embeds.js'
import { showApprovalHistory } from './history.js'
import { showApprovalAtIndex } from './review-flow.js'

export interface MenuDeps {
  db: DatabaseService
  log: FastifyBaseLogger
}

/** Extended deps for handleMenuAction which may delegate to review flow */
export interface MenuActionDeps extends MenuDeps {
  approvalService: ApprovalService
}

/**
 * Show main approval management menu
 */
export async function showApprovalMainMenu(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  deps: MenuDeps,
): Promise<void> {
  const { db, log } = deps

  try {
    // Get counts for display
    const [pendingApprovals, totalCount] = await Promise.all([
      db.getPendingApprovalRequests(),
      db.getApprovalHistoryCount(),
    ])

    const pendingCount = pendingApprovals.length

    const menuEmbed = createMainMenuEmbed(pendingCount, totalCount)
    const menuActionRow = createMainMenuActionRow(pendingCount, totalCount)

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        embeds: [menuEmbed],
        components: [menuActionRow],
        flags: MessageFlags.Ephemeral,
      })
    } else {
      await interaction.editReply({
        content: '',
        embeds: [menuEmbed],
        components: [menuActionRow],
      })
    }

    log.debug(
      {
        userId: interaction.user.id,
        pendingCount,
        totalCount,
      },
      'Showed approval management menu',
    )
  } catch (error) {
    log.error({ error }, 'Error showing approval main menu')
    throw error
  }
}

/**
 * Handle main menu button actions
 */
export async function handleMenuAction(
  interaction: ButtonInteraction,
  menuAction: string,
  deps: MenuActionDeps,
): Promise<void> {
  const { db, log } = deps

  await interaction.deferUpdate()

  try {
    switch (menuAction) {
      case 'pending': {
        // Show pending approvals review flow
        const pendingApprovals = await db.getPendingApprovalRequests()
        if (pendingApprovals.length === 0) {
          await interaction.editReply({
            content: '✅ No pending approval requests found!',
            embeds: [],
            components: [],
          })
          return
        }
        await showApprovalAtIndex(interaction, 0, pendingApprovals, deps)
        break
      }

      case 'history':
        // Show approval history browser
        await showApprovalHistory(interaction, 0, 'all', deps)
        break

      case 'main':
        // Go back to main menu
        await showApprovalMainMenu(interaction, deps)
        break

      case 'exit':
        // Close the interaction
        await interaction.editReply({
          content: '✅ Approval management closed.',
          embeds: [],
          components: [],
        })
        break

      default:
        await interaction.editReply('❌ Unknown menu action')
    }
  } catch (error) {
    log.error({ error, menuAction }, 'Error handling menu action')
    await interaction.editReply('❌ Error processing menu action')
  }
}
