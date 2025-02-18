import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  type SlashCommandBuilder,
  type InteractionReplyOptions,
  type ChatInputCommandInteraction,
} from 'discord.js'
import { MessageFlags } from 'discord-api-types/v10'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type {
  MediaNotification,
  DiscordEmbed,
  DiscordWebhookPayload,
} from '@root/types/discord.types.js'
import {
  notificationsCommand,
  handleNotificationButtons,
  handlePlexUsernameModal,
  handleProfileEditModal,
} from '@root/utils/discord-commands/notifications-command.js'

type BotStatus = 'stopped' | 'starting' | 'running' | 'stopping'
type CommandHandler = (
  interaction: ChatInputCommandInteraction,
) => Promise<void>

interface Command {
  data: SlashCommandBuilder
  execute: CommandHandler
}

export class DiscordNotificationService {
  private readonly COLOR = 0x48a9a6
  private botClient: Client | null = null
  private botStatus: BotStatus = 'stopped'
  private readonly commands: Map<string, Command> = new Map()

  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log.info('Initializing Discord notification service')
    this.initializeCommands()
  }

  private get config() {
    return this.fastify.config
  }

  private get botConfig() {
    this.log.debug('Validating bot configuration')
    const required = [
      'discordBotToken',
      'discordClientId',
      'discordGuildId',
    ] as const

    const missing = required.filter((key) => !this.config[key])
    if (missing.length > 0) {
      const error = `Missing required Discord bot config: ${missing.join(', ')}`
      this.log.error(error)
      throw new Error(error)
    }

    return {
      token: this.config.discordBotToken,
      clientId: this.config.discordClientId,
      guildId: this.config.discordGuildId,
    }
  }

  private initializeCommands() {
    this.log.debug('Initializing Discord bot commands')
    try {
      this.commands.set('notifications', {
        data: notificationsCommand.data,
        execute: async (interaction) => {
          this.log.debug(
            { userId: interaction.user.id },
            'Executing notifications command',
          )
          await notificationsCommand.execute(interaction, {
            fastify: this.fastify,
            log: this.log,
          })
        },
      })
      this.log.info('Notification commands initialized')
    } catch (error) {
      this.log.error({ error }, 'Failed to initialize notification commands')
      throw error
    }
  }

  private async registerCommands(): Promise<boolean> {
    this.log.info('Registering Discord application commands')
    try {
      const config = this.botConfig
      const rest = new REST().setToken(config.token)

      const commandsData = Array.from(this.commands.values()).map((cmd) =>
        cmd.data.toJSON(),
      )

      await rest.put(
        Routes.applicationGuildCommands(config.clientId, config.guildId),
        { body: commandsData },
      )

      this.log.info('Successfully registered application commands')
      return true
    } catch (error) {
      this.log.error({ error }, 'Failed to register commands')
      return false
    }
  }

  async startBot(): Promise<boolean> {
    if (this.botStatus !== 'stopped') {
      this.log.warn(`Cannot start bot: current status is ${this.botStatus}`)
      return false
    }

    try {
      const commandsRegistered = await this.registerCommands()
      if (!commandsRegistered) {
        this.log.error('Failed to register commands during bot startup')
        return false
      }

      this.botStatus = 'starting'
      this.log.info('Initializing Discord bot client')

      this.botClient = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
        ],
      })

      this.setupBotEventHandlers()

      await this.botClient.login(this.botConfig.token)
      this.botStatus = 'running'
      this.log.info('Discord bot started successfully')
      return true
    } catch (error) {
      this.log.error({ error }, 'Failed to start Discord bot')
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

  getBotStatus(): BotStatus {
    return this.botStatus
  }

  private setupBotEventHandlers() {
    if (!this.botClient) {
      this.log.warn('Attempted to setup event handlers without bot client')
      return
    }

    this.botClient.on('ready', () => {
      this.botStatus = 'running'
      this.log.info('Discord bot is ready')
    })

    this.botClient.on('error', (error) => {
      this.log.error({ error }, 'Discord bot error occurred')
    })

    this.botClient.on('interactionCreate', async (interaction) => {
      try {
        const {
          id: interactionId,
          user: { id: userId },
        } = interaction
        this.log.debug(
          { interactionId, userId, type: interaction.type },
          'Handling interaction',
        )

        if (interaction.isChatInputCommand()) {
          const command = this.commands.get(interaction.commandName)
          if (!command) {
            this.log.warn(
              { command: interaction.commandName },
              'Unknown command received',
            )
            await interaction.reply({
              content: 'Unknown command',
              flags: MessageFlags.Ephemeral,
            } as InteractionReplyOptions)
            return
          }
          await command.execute(interaction)
        } else if (interaction.isButton()) {
          this.log.debug(
            { buttonId: interaction.customId },
            'Handling notification button interaction',
          )
          await handleNotificationButtons(interaction, {
            fastify: this.fastify,
            log: this.log,
          })
        } else if (interaction.isModalSubmit()) {
          this.log.debug(
            { modalId: interaction.customId },
            'Handling modal submission',
          )
          switch (interaction.customId) {
            case 'plexUsernameModal':
              await handlePlexUsernameModal(interaction, {
                fastify: this.fastify,
                log: this.log,
              })
              break
            case 'editProfileModal':
              await handleProfileEditModal(interaction, {
                fastify: this.fastify,
                log: this.log,
              })
              break
            default:
              this.log.warn(
                { modalId: interaction.customId },
                'Unknown modal submission',
              )
          }
        }
      } catch (error) {
        this.log.error({ error }, 'Error handling interaction')
        if (interaction.isRepliable()) {
          const errorMessage: InteractionReplyOptions = {
            content: 'An error occurred while processing your request.',
            flags: MessageFlags.Ephemeral,
          }
          try {
            if (interaction.replied || interaction.deferred) {
              await interaction.followUp(errorMessage)
            } else {
              await interaction.reply(errorMessage)
            }
          } catch (replyError) {
            this.log.error({ error: replyError }, 'Error sending error reply')
          }
        }
      }
    })
  }

  async sendNotification(payload: DiscordWebhookPayload): Promise<boolean> {
    if (!this.config.discordWebhookUrl) {
      this.log.warn(
        'Attempted to send notification without webhook URL configured',
      )
      return false
    }

    try {
      this.log.debug({ payload }, 'Sending Discord webhook notification')
      const response = await fetch(this.config.discordWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        this.log.error(
          { status: response.status },
          'Discord webhook request failed',
        )
        return false
      }

      this.log.info('Discord webhook sent successfully')
      return true
    } catch (error) {
      this.log.error({ error }, 'Error sending Discord webhook')
      return false
    }
  }

  async sendMediaNotification(
    notification: MediaNotification,
  ): Promise<boolean> {
    this.log.debug({ notification }, 'Creating media notification')
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

  async sendDirectMessage(
    discordId: string,
    notification: MediaNotification,
  ): Promise<boolean> {
    if (!this.botClient || this.botStatus !== 'running') {
      this.log.warn('Bot client not available for sending direct message')
      return false
    }

    try {
      const emoji = notification.type === 'movie' ? '🎬' : '📺'

      const embed: DiscordEmbed = {
        title: notification.title,
        description: `Your ${notification.type} is available to watch! ${emoji}`,
        color: this.COLOR,
        timestamp: new Date().toISOString(),
      }

      if (notification.posterUrl) {
        embed.image = {
          url: notification.posterUrl,
        }
      }

      const user = await this.botClient.users.fetch(discordId)
      if (!user) {
        this.log.warn({ discordId }, 'Could not find Discord user')
        return false
      }

      await user.send({
        content: `Hey ${user}! 👋`,
        embeds: [embed],
      })

      return true
    } catch (error) {
      this.log.error({ error, discordId }, 'Failed to send direct message')
      return false
    }
  }

  addCommand(command: Command) {
    this.log.info({ command: command.data.name }, 'Adding new command')
    this.commands.set(command.data.name, command)
    if (this.botStatus === 'running') {
      this.log.debug('Registering new command with Discord')
      void this.registerCommands()
    }
  }
}
