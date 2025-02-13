import { Client, GatewayIntentBits } from 'discord.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type {
  MediaNotification,
  DiscordEmbed,
  DiscordWebhookPayload,
} from '@root/types/discord.types.js'

export class DiscordNotificationService {
  private readonly COLOR = 0x48a9a6
  private botClient: Client | null = null
  private botStatus: 'stopped' | 'starting' | 'running' | 'stopping' = 'stopped'

  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {}

  private get config() {
    return this.fastify.config
  }

  private get botConfig() {
    const required = [
      'discordBotToken',
      'discordClientId',
      'discordGuildId',
    ] as const

    const missing = required.filter((key) => !this.config[key])
    if (missing.length > 0) {
      throw new Error(
        `Missing required Discord bot config: ${missing.join(', ')}`,
      )
    }

    return {
      token: this.config.discordBotToken,
      clientId: this.config.discordClientId,
      guildId: this.config.discordGuildId,
    }
  }

  // Bot Control Methods
  async startBot(): Promise<boolean> {
    if (this.botStatus !== 'stopped') {
      this.log.warn(`Cannot start bot: current status is ${this.botStatus}`)
      return false
    }

    try {
      // Validate all required bot config is present
      const config = this.botConfig
    } catch (error) {
      this.log.error('Cannot start bot:', error)
      return false
    }

    try {
      this.botStatus = 'starting'
      this.botClient = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
        ],
      })

      // Set up event handlers
      this.botClient.on('ready', () => {
        this.botStatus = 'running'
        this.log.info('Discord bot is ready!')
      })

      this.botClient.on('error', (error) => {
        this.log.error('Discord bot error:', error)
      })

      // Add your bot event handlers here
      this.setupBotEventHandlers()

      // Login to Discord
      await this.botClient.login(this.botConfig.token)
      return true
    } catch (error) {
      this.log.error('Failed to start Discord bot:', error)
      this.botStatus = 'stopped'
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
      this.botStatus = 'stopping'
      if (this.botClient) {
        await this.botClient.destroy()
        this.botClient = null
      }
      this.botStatus = 'stopped'
      this.log.info('Discord bot stopped successfully')
      return true
    } catch (error) {
      this.log.error('Error stopping Discord bot:', error)
      this.botStatus = 'stopped' // Force status to stopped even if there was an error
      this.botClient = null
      return false
    }
  }

  getBotStatus(): string {
    return this.botStatus
  }

  private setupBotEventHandlers() {
    if (!this.botClient) return

    this.botClient.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return

      switch (interaction.commandName) {
        case 'status':
          await interaction.reply({
            content: `Bot Status: ${this.botStatus}`,
            ephemeral: true,
          })
          break
        // Add more command handlers here
      }
    })

    // Add more event handlers as needed
  }

  // Existing Webhook Methods
  async sendNotification(payload: DiscordWebhookPayload): Promise<boolean> {
    if (!this.config.discordWebhookUrl) {
      return false
    }

    try {
      const response = await fetch(this.config.discordWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        this.log.error('Discord webhook request failed', {
          status: response.status,
        })
        return false
      }

      this.log.info('Discord webhook sent successfully')
      return true
    } catch (error) {
      this.log.error('Error sending Discord webhook:', error)
      return false
    }
  }

  async sendMediaNotification(
    notification: MediaNotification,
  ): Promise<boolean> {
    const payload = this.createMediaEmbed(notification)
    return this.sendNotification(payload)
  }

  private createMediaEmbed(
    notification: MediaNotification,
  ): DiscordWebhookPayload {
    const emoji = notification.type === 'movie' ? '🎬' : '📺'
    const mediaType =
      notification.type.charAt(0).toUpperCase() + notification.type.slice(1)

    const embed: DiscordEmbed = {
      title: notification.title,
      description: `${emoji} New ${mediaType} Added`,
      color: this.COLOR,
      timestamp: new Date().toISOString(),
      footer: {
        text: `Added by ${notification.username}`,
      },
      fields: [
        {
          name: 'Type',
          value: mediaType,
          inline: true,
        },
      ],
    }

    if (notification.posterUrl) {
      embed.image = {
        url: notification.posterUrl,
      }
    }

    return {
      embeds: [embed],
      username: 'Pulsarr',
      avatar_url:
        'https://raw.githubusercontent.com/jamcalli/Pulsarr/master/src/client/assets/images/pulsarr.png',
    }
  }
}
