import type { DirectMessage } from '@root/types/discord.types.js'
import type {
  DeliveryResult,
  NotificationTestResult,
} from '@root/types/notification.types.js'
import { createServiceLogger } from '@utils/logger.js'
import { Client, GatewayIntentBits } from 'discord.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import {
  type DiscordDmDeps,
  sendNotification,
  testNotification,
} from '../channels/discord-dm.js'
import { timeTest } from '../channels/time-test.js'
import {
  type Command,
  createCommandRegistry,
  registerCommandsWithDiscord,
} from './command-registry.js'
import { setupBotEventHandlers } from './event-router.js'

export type BotStatus = 'stopped' | 'starting' | 'running' | 'stopping'

export class DiscordBotService {
  private readonly log: FastifyBaseLogger
  private botClient: Client | null = null
  private botStatus: BotStatus = 'stopped'
  private statusChangeCallback: (() => void) | null = null
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

  private get dmDeps(): DiscordDmDeps {
    return {
      logger: this.log,
      botClient: this.botClient,
      botStatus: this.botStatus,
    }
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

  async startBot(): Promise<boolean> {
    if (this.botStatus !== 'stopped') {
      this.log.warn(`Cannot start bot: current status is ${this.botStatus}`)
      return false
    }

    this.setBotStatus('starting')
    try {
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
        this.setBotStatus('stopped')
        return false
      }

      this.log.debug('Initializing Discord bot client')

      this.botClient = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
        ],
      })

      setupBotEventHandlers(this.botClient, {
        log: this.log,
        fastify: this.fastify,
        commands: this.commands,
        onBotReady: () => {
          this.setBotStatus('running')
        },
      })

      await this.botClient.login(this.botConfig.discordBotToken)
      this.log.info('Discord bot started successfully')
      return true
    } catch (error) {
      this.log.error({ error }, 'Failed to start Discord bot')
      this.setBotStatus('stopped')
      this.botClient = null
      return false
    }
  }

  async stopBot(): Promise<boolean> {
    if (this.botStatus !== 'running' && this.botStatus !== 'starting') {
      this.log.warn(`Cannot stop bot: current status is ${this.botStatus}`)
      return false
    }

    try {
      this.log.info('Stopping Discord bot')
      this.setBotStatus('stopping')

      if (this.botClient) {
        await this.botClient.destroy()
        this.botClient = null
      }

      this.setBotStatus('stopped')
      this.log.info('Discord bot stopped successfully')
      return true
    } catch (error) {
      this.log.error({ error }, 'Error stopping Discord bot')
      this.setBotStatus('stopped')
      this.botClient = null
      return false
    }
  }

  getBotStatus(): BotStatus {
    return this.botStatus
  }

  onStatusChange(callback: () => void): void {
    this.statusChangeCallback = callback
  }

  // Every transition notifies, including the intermediate starting and stopping states
  private setBotStatus(status: BotStatus): void {
    if (this.botStatus === status) return
    this.botStatus = status
    this.statusChangeCallback?.()
  }

  async sendNotification(
    discordId: string,
    message: DirectMessage,
  ): Promise<DeliveryResult> {
    return sendNotification(discordId, message, this.dmDeps)
  }

  async testNotification(discordId: string): Promise<NotificationTestResult> {
    return timeTest(() => testNotification(discordId, this.dmDeps))
  }
}
