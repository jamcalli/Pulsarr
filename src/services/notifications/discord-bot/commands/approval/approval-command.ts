/**
 * Approval Command Entry Point
 *
 * Slash command definition for /approvals.
 * Primary admin only - review and manage pending approval requests.
 */

import type { ApprovalService } from '@services/approval.service.js'
import type { DatabaseService } from '@services/database.service.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import { MessageFlags, SlashCommandBuilder } from 'discord.js'
import type { FastifyBaseLogger } from 'fastify'
import { checkUserIsPrimary } from './data.js'
import { showApprovalMainMenu } from './menu.js'

export interface ApprovalCommandDeps {
  db: DatabaseService
  approvalService: ApprovalService
  log: FastifyBaseLogger
}

export const approvalCommand = {
  data: new SlashCommandBuilder()
    .setName('approvals')
    .setDescription('Review pending approval requests (Primary admin only)'),

  async execute(
    interaction: ChatInputCommandInteraction,
    deps: ApprovalCommandDeps,
  ): Promise<void> {
    const { db, log } = deps

    try {
      // Check if user is primary admin
      const isPrimary = await checkUserIsPrimary(interaction.user.id, {
        db,
        log,
      })
      if (!isPrimary) {
        await interaction.reply({
          content: '❌ You are not authorized to use this command.',
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      log.debug(
        { userId: interaction.user.id },
        'Primary admin accessed approval command',
      )

      // Show the main approval management menu
      await showApprovalMainMenu(interaction, { db, log })
    } catch (error) {
      log.error({ error }, 'Error in approval command')

      const errorMessage =
        error instanceof Error ? error.message : 'An unknown error occurred'

      if (interaction.replied) {
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
  },
}

// Re-export handlers for the event router
export { handleApprovalButtons } from './handlers.js'
export { showApprovalAtIndex } from './review-flow.js'
