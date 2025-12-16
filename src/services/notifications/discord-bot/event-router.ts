/**
 * Discord Event Router
 *
 * Routes Discord interactions (commands, buttons, modals) to appropriate handlers.
 * This is the critical path for all Discord bot interactions.
 */

import {
  type ButtonInteraction,
  type Client,
  Events,
  type Interaction,
  type InteractionReplyOptions,
  MessageFlags,
} from 'discord.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { Command } from './command-registry.js'
import {
  handleApprovalButtons,
  showApprovalAtIndex,
} from './commands/approval/approval-command.js'
import {
  handleNotificationButtons,
  handlePlexUsernameModal,
  handleProfileEditModal,
} from './commands/notifications/notifications-command.js'

export interface EventRouterDeps {
  log: FastifyBaseLogger
  fastify: FastifyInstance
  commands: Map<string, Command>
  onBotReady: () => void
}

/** Common deps for internal interaction handlers */
interface HandlerDeps {
  log: FastifyBaseLogger
  fastify: FastifyInstance
}

/**
 * Sets up all event handlers on the Discord bot client.
 */
export function setupBotEventHandlers(
  client: Client,
  deps: EventRouterDeps,
): void {
  const { log, fastify, commands, onBotReady } = deps

  // Bot ready event
  client.once(Events.ClientReady, (readyClient) => {
    onBotReady()
    log.info({ botUsername: readyClient.user.username }, 'Discord bot is ready')
  })

  // Error handler
  client.on('error', (error) => {
    log.error({ error }, 'Discord bot error occurred')
  })

  // Interaction handler
  client.on('interactionCreate', async (interaction) => {
    await handleInteraction(interaction, { log, fastify, commands })
  })
}

/**
 * Routes an interaction to the appropriate handler.
 */
async function handleInteraction(
  interaction: Interaction,
  deps: HandlerDeps & { commands: Map<string, Command> },
): Promise<void> {
  const { log, fastify, commands } = deps

  try {
    const {
      id: interactionId,
      user: { id: userId },
    } = interaction

    log.debug(
      { interactionId, userId, type: interaction.type },
      'Handling interaction',
    )

    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction, commands, log)
    } else if (interaction.isButton()) {
      await handleButtonInteraction(interaction, { log, fastify })
    } else if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction, { log, fastify })
    }
  } catch (error) {
    log.error({ error }, 'Error handling interaction')
    await sendErrorReply(interaction, log)
  }
}

/**
 * Handles slash command interactions.
 */
async function handleSlashCommand(
  interaction: Interaction,
  commands: Map<string, Command>,
  log: FastifyBaseLogger,
): Promise<void> {
  if (!interaction.isChatInputCommand()) return

  const command = commands.get(interaction.commandName)
  if (!command) {
    log.warn({ command: interaction.commandName }, 'Unknown command received')
    await interaction.reply({
      content: 'Unknown command',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await command.execute(interaction)
}

/**
 * Handles button interactions, routing based on customId prefix.
 */
async function handleButtonInteraction(
  interaction: ButtonInteraction,
  deps: HandlerDeps,
): Promise<void> {
  const { log, fastify } = deps

  log.debug({ buttonId: interaction.customId }, 'Handling button interaction')

  if (interaction.customId.startsWith('approval_')) {
    await handleApprovalButtons(interaction, {
      db: fastify.db,
      approvalService: fastify.approvalService,
      logger: log,
    })
  } else if (interaction.customId.startsWith('review_approvals_')) {
    await handleReviewApprovalsButton(interaction, { fastify, log })
  } else {
    await handleNotificationButtons(interaction, {
      db: fastify.db,
      logger: log,
    })
  }
}

/**
 * Handles modal submit interactions.
 */
async function handleModalSubmit(
  interaction: Interaction,
  deps: HandlerDeps,
): Promise<void> {
  if (!interaction.isModalSubmit()) return

  const { log, fastify } = deps

  log.debug({ modalId: interaction.customId }, 'Handling modal submission')

  switch (interaction.customId) {
    case 'plexUsernameModal':
      await handlePlexUsernameModal(interaction, {
        db: fastify.db,
        logger: log,
      })
      break
    case 'editProfileModal':
      await handleProfileEditModal(interaction, { db: fastify.db, logger: log })
      break
    default:
      log.warn({ modalId: interaction.customId }, 'Unknown modal submission')
      await interaction.reply({
        content: 'This form is no longer valid. Please try again.',
        flags: MessageFlags.Ephemeral,
      })
  }
}

/**
 * Handles the "Review Approvals" button - triggers the approval flow.
 */
async function handleReviewApprovalsButton(
  interaction: ButtonInteraction,
  deps: HandlerDeps,
): Promise<void> {
  const { fastify, log } = deps

  try {
    // Check if user is primary admin
    const user = await fastify.db.getUserByDiscordId(interaction.user.id)

    if (!user?.is_primary_token) {
      await interaction.reply({
        content: '❌ You are not authorized to review approvals.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    log.debug(
      { userId: interaction.user.id },
      'Primary admin clicked Review Approvals button',
    )

    // Get all pending approval requests
    const pendingApprovals = await fastify.db.getPendingApprovalRequests()

    if (pendingApprovals.length === 0) {
      await interaction.reply({
        content: '✅ No pending approval requests found!',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Start with the first approval (index 0) - make it ephemeral
    await showApprovalAtIndex(
      interaction,
      0,
      pendingApprovals,
      {
        db: fastify.db,
        approvalService: fastify.approvalService,
        logger: log,
      },
      true,
    )
  } catch (error) {
    log.error({ error }, 'Error handling review approvals button')

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ Error starting approval review',
        flags: MessageFlags.Ephemeral,
      })
    } else {
      await interaction.followUp({
        content: '❌ Error starting approval review',
        flags: MessageFlags.Ephemeral,
      })
    }
  }
}

/**
 * Sends an error reply to an interaction.
 */
async function sendErrorReply(
  interaction: Interaction,
  log: FastifyBaseLogger,
): Promise<void> {
  if (!('isRepliable' in interaction) || !interaction.isRepliable()) return

  const errorMessage: InteractionReplyOptions = {
    content: 'An error occurred while processing your request.',
    flags: MessageFlags.Ephemeral,
  }

  try {
    if (
      'replied' in interaction &&
      'deferred' in interaction &&
      (interaction.replied || interaction.deferred)
    ) {
      await interaction.followUp(errorMessage)
    } else if ('reply' in interaction) {
      await interaction.reply(errorMessage)
    }
  } catch (replyError) {
    log.error({ error: replyError }, 'Error sending error reply')
  }
}
