import { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder,
  ChatInputCommandInteraction
} from 'discord.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type {
  MediaNotification,
  DiscordEmbed,
  DiscordWebhookPayload,
} from '@root/types/discord.types.js'

type CommandHandler = (interaction: ChatInputCommandInteraction) => Promise<void>

interface Command {
  data: SlashCommandBuilder
  execute: CommandHandler
}

export class DiscordNotificationService {
  private readonly COLOR = 0x48a9a6
  private botClient: Client | null = null
  private botStatus: 'stopped' | 'starting' | 'running' | 'stopping' = 'stopped'
  private readonly commands: Map<string, Command> = new Map()

  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.initializeCommands()
  }

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

  private initializeCommands() {
    // Status command
    this.commands.set('status', {
      data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Get the current status of the bot'),
      execute: async (interaction) => {
        await interaction.reply({
          content: `Bot Status: ${this.botStatus}`,
          ephemeral: true,
        })
      }
    })

    // Help command
    this.commands.set('help', {
      data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show available commands and their usage'),
      execute: async (interaction) => {
        const commandList = Array.from(this.commands.values())
          .map(cmd => `/${cmd.data.name} - ${cmd.data.description}`)
          .join('\n')
        
        await interaction.reply({
          content: `Available commands:\n${commandList}`,
          ephemeral: true,
        })
      }
    })
  }

  private async registerCommands(): Promise<boolean> {
    try {
      const config = this.botConfig
      const rest = new REST().setToken(config.token)
      
      this.log.info('Started refreshing application (/) commands.')
      
      const commandsData = Array.from(this.commands.values()).map(cmd => cmd.data.toJSON())
      
      await rest.put(
        Routes.applicationGuildCommands(config.clientId, config.guildId),
        { body: commandsData },
      )
      
      this.log.info('Successfully reloaded application (/) commands.')
      return true
    } catch (error) {
      this.log.error('Error registering commands:', error)
      return false
    }
  }

  // Bot Control Methods
  async startBot(): Promise<boolean> {
    if (this.botStatus !== 'stopped') {
      this.log.warn(`Cannot start bot: current status is ${this.botStatus}`)
      return false
    }

    try {
      // Validate all required bot config is present and register commands
      const config = this.botConfig
      const commandsRegistered = await this.registerCommands()
      
      if (!commandsRegistered) {
        this.log.error('Failed to register commands')
        return false
      }
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
      this.botStatus = 'stopped'
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

      const command = this.commands.get(interaction.commandName)
      if (!command) {
        await interaction.reply({
          content: 'Unknown command',
          ephemeral: true,
        })
        return
      }

      try {
        await command.execute(interaction)
      } catch (error) {
        this.log.error('Error executing command:', error)
        await interaction.reply({
          content: 'There was an error executing this command',
          ephemeral: true,
        })
      }
    })
  }

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

  addCommand(command: Command) {
    this.commands.set(command.data.name, command)
    if (this.botStatus === 'running') {
      void this.registerCommands()
    }
  }
}