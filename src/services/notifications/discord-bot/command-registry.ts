/**
 * Discord Command Registry
 *
 * Manages slash command registration and storage.
 * Commands are registered globally for DM support.
 */

import { approvalCommand } from '@root/utils/discord-commands/approval-command.js'
import { notificationsCommand } from '@root/utils/discord-commands/notifications-command.js'
import {
  type ChatInputCommandInteraction,
  REST,
  Routes,
  type SlashCommandBuilder,
} from 'discord.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

type CommandHandler = (
  interaction: ChatInputCommandInteraction,
) => Promise<void>

export interface Command {
  data: SlashCommandBuilder
  execute: CommandHandler
}

export interface CommandRegistryDeps {
  log: FastifyBaseLogger
  fastify: FastifyInstance
  config: {
    discordBotToken: string
    discordClientId: string
    discordGuildId: string
  }
}

/**
 * Creates and initializes the command registry with default commands.
 */
export function createCommandRegistry(
  deps: CommandRegistryDeps,
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
          fastify,
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
          fastify,
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
 * Registers commands with Discord API (globally for DM support).
 * Also clears legacy guild-specific commands.
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

    // Clear old guild commands first (cleanup from previous registration method)
    try {
      await rest.put(
        Routes.applicationGuildCommands(
          config.discordClientId,
          config.discordGuildId,
        ),
        { body: [] },
      )
      log.debug('Cleared old guild-specific commands')
    } catch (error) {
      log.warn({ error }, 'Failed to clear old guild commands (may not exist)')
    }

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

/**
 * Adds a new command to the registry.
 * If the bot is running, re-registers all commands.
 */
export function addCommand(
  commands: Map<string, Command>,
  command: Command,
  deps: CommandRegistryDeps,
  isRunning: boolean,
): void {
  const { log } = deps

  log.info({ command: command.data.name }, 'Adding new command')
  commands.set(command.data.name, command)

  if (isRunning) {
    log.debug('Registering new command with Discord')
    void registerCommandsWithDiscord(commands, deps)
  }
}
