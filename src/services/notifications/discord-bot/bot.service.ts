/**
 * Discord Bot Service
 *
 * Manages the Discord bot lifecycle (start, stop, status).
 * Coordinates command registry and event routing.
 * Handles DM sending (requires bot client).
 */

import type {
  MediaNotification,
  SystemNotification,
} from '@root/types/discord.types.js'
import { createServiceLogger } from '@utils/logger.js'
import { Client, GatewayIntentBits } from 'discord.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { sendDirectMessage } from '../channels/discord-dm.js'
import {
  type Command,
  createCommandRegistry,
  registerCommandsWithDiscord,
} from './command-registry.js'
import { setupBotEventHandlers } from './event-router.js'

export type BotStatus = 'stopped' | 'starting' | 'running' | 'stopping'

/**
 * Discord Bot Service
 *
 * Manages the Discord bot client lifecycle and provides
 * access to Discord notification capabilities.
 */
export class DiscordBotService {
  private readonly log: FastifyBaseLogger
  private botClient: Client | null = null
  private botStatus: BotStatus = 'stopped'
  private readonly commands: Map<string, Command>

  constructor(
    readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'DISCORD')
    this.log.debug('Initializing Discord bot service')

    this.commands = createCommandRegistry({
      log: this.log,
      fastify: this.fastify,
    })
  }

  private get config() {
    return this.fastify.config
  }

  private get botConfig() {
    const required = ['discordBotToken', 'discordClientId'] as const

    const missing = required.filter((key) => !this.config[key])
    if (missing.length > 0) {
      const error = new Error(
        `Missing required Discord bot config: ${missing.join(', ')}`,
      )
      this.log.error({ error }, 'Missing required Discord bot config')
      throw error
    }

    return {
      discordBotToken: this.config.discordBotToken,
      discordClientId: this.config.discordClientId,
    }
  }

  /**
   * Starts the Discord bot.
   */
  async startBot(): Promise<boolean> {
    if (this.botStatus !== 'stopped') {
      this.log.warn(`Cannot start bot: current status is ${this.botStatus}`)
      return false
    }

    try {
      // Register commands with Discord API
      const commandsRegistered = await registerCommandsWithDiscord(
        this.commands,
        {
          log: this.log,
          fastify: this.fastify,
          config: this.botConfig,
        },
      )

      if (!commandsRegistered) {
        this.log.error('Failed to register commands during bot startup')
        return false
      }

      this.botStatus = 'starting'
      this.log.debug('Initializing Discord bot client')

      this.botClient = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
        ],
      })

      // Setup event handlers
      setupBotEventHandlers(this.botClient, {
        log: this.log,
        fastify: this.fastify,
        commands: this.commands,
        onBotReady: () => {
          this.botStatus = 'running'
        },
      })

      await this.botClient.login(this.botConfig.discordBotToken)
      this.log.info('Discord bot started successfully')
      return true
    } catch (error) {
      this.log.error({ error }, 'Failed to start Discord bot')
      this.botStatus = 'stopped'
      this.botClient = null
      return false
    }
  }

  /**
   * Stops the Discord bot.
   */
  async stopBot(): Promise<boolean> {
    if (this.botStatus !== 'running' && this.botStatus !== 'starting') {
      this.log.warn(`Cannot stop bot: current status is ${this.botStatus}`)
      return false
    }

    try {
      this.log.info('Stopping Discord bot')
      this.botStatus = 'stopping'

      if (this.botClient) {
        await this.botClient.destroy()
        this.botClient = null
      }

      this.botStatus = 'stopped'
      this.log.info('Discord bot stopped successfully')
      return true
    } catch (error) {
      this.log.error({ error }, 'Error stopping Discord bot')
      this.botStatus = 'stopped'
      this.botClient = null
      return false
    }
  }

  /**
   * Gets the current bot status.
   */
  getBotStatus(): BotStatus {
    return this.botStatus
  }

  /**
   * Check if Discord bot config is present.
   */
  get hasBotConfig(): boolean {
    const required = ['discordBotToken', 'discordClientId'] as const
    return required.every((key) => Boolean(this.config[key]))
  }

  /**
   * Adds a new command to the registry.
   * If the bot is running, re-registers commands with Discord.
   */
  addCommand(command: Command): void {
    this.log.info({ command: command.data.name }, 'Adding new command')
    this.commands.set(command.data.name, command)

    // Only re-register with Discord if bot is running (which means config is valid)
    if (this.botStatus === 'running') {
      this.log.debug('Registering new command with Discord')
      void registerCommandsWithDiscord(this.commands, {
        log: this.log,
        fastify: this.fastify,
        config: this.botConfig,
      })
    }
  }

  /**
   * Sends a direct message to a Discord user.
   * Requires the bot to be running.
   */
  async sendDirectMessage(
    discordId: string,
    notification: MediaNotification | SystemNotification,
  ): Promise<boolean> {
    return sendDirectMessage(discordId, notification, {
      log: this.log,
      botClient: this.botClient,
      botStatus: this.botStatus,
    })
  }
}
