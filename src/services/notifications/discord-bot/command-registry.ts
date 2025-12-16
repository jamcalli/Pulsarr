/**
 * Discord Command Registry
 *
 * Manages slash command registration and storage.
 * Commands are registered globally for DM support.
 */

import {
  type ChatInputCommandInteraction,
  REST,
  Routes,
  type SlashCommandBuilder,
} from 'discord.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { approvalCommand } from './commands/approval/approval-command.js'
import { notificationsCommand } from './commands/notifications/notifications-command.js'

type CommandHandler = (
  interaction: ChatInputCommandInteraction,
) => Promise<void>

export interface Command {
  data: SlashCommandBuilder
  execute: CommandHandler
}

export interface CommandRegistryCreateDeps {
  log: FastifyBaseLogger
  fastify: FastifyInstance
}

export interface CommandRegistryDeps extends CommandRegistryCreateDeps {
  config: {
    discordBotToken: string
    discordClientId: string
  }
}

/**
 * Creates and initializes the command registry with default commands.
 */
export function createCommandRegistry(
  deps: CommandRegistryCreateDeps,
): Map<string, Command> {
  const { log, fastify } = deps
  const commands = new Map<string, Command>()

  log.debug('Initializing Discord bot commands')

  try {
    commands.set('notifications', {
      data: notificationsCommand.data,
      execute: async (interaction) => {
        log.debug(
          { userId: interaction.user.id },
          'Executing notifications command',
        )
        await notificationsCommand.execute(interaction, {
          db: fastify.db,
          log,
        })
      },
    })

    commands.set('approvals', {
      data: approvalCommand.data,
      execute: async (interaction) => {
        log.debug(
          { userId: interaction.user.id },
          'Executing approvals command',
        )
        await approvalCommand.execute(interaction, {
          db: fastify.db,
          approvalService: fastify.approvalService,
          log,
        })
      },
    })

    log.debug('Discord bot commands initialized')
  } catch (error) {
    log.error({ error }, 'Failed to initialize bot commands')
    throw error
  }

  return commands
}

/**
 * Registers commands with Discord API globally for DM support.
 */
export async function registerCommandsWithDiscord(
  commands: Map<string, Command>,
  deps: CommandRegistryDeps,
): Promise<boolean> {
  const { log, config } = deps

  log.debug('Registering Discord application commands globally')

  try {
    const rest = new REST().setToken(config.discordBotToken)

    const commandsData = Array.from(commands.values()).map((cmd) =>
      cmd.data.toJSON(),
    )

    // Register commands globally for DM support
    await rest.put(Routes.applicationCommands(config.discordClientId), {
      body: commandsData,
    })

    log.debug('Successfully registered global application commands')
    return true
  } catch (error) {
    log.error({ error }, 'Failed to register global commands')
    return false
  }
}
