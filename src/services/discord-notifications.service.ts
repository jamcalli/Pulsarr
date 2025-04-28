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
  SystemNotification,
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

    // Look up user to get alias if available
    let displayName = notification.username
    try {
      // Get all users and find the one matching the Plex username
      const users = await this.fastify.db.getAllUsers()
      const user = users.find((u) => u.name === notification.username)

      // If the user has an alias set, use it instead of their username
      if (user?.alias) {
        displayName = user.alias
        this.log.debug(
          `Using alias "${displayName}" instead of username "${notification.username}" for webhook`,
        )
      }
    } catch (error) {
      this.log.error('Error looking up user alias for webhook:', error)
      // Fall back to username if there's an error
    }

    // Create the media embed with the display name (alias or username)
    const payload = this.createMediaEmbed(notification, displayName)
    return this.sendNotification(payload)
  }

  private createMediaEmbed(
    notification: MediaNotification,
    displayName: string = notification.username,
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
        text: `Added by ${displayName}`,
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
    notification: MediaNotification | SystemNotification,
  ): Promise<boolean> {
    if (!this.botClient || this.botStatus !== 'running') {
      this.log.warn('Bot client not available for sending direct message')
      return false
    }

    try {
      let embed: DiscordEmbed

      if (notification.type === 'system') {
        // Handle system notification
        // Define color constants for success or failure
        const RED = 0xff0000
        const GREEN = 0x00ff00

        // Safety is triggered if any field has the name "Safety Reason" OR if the title contains "Safety Triggered"
        // OR if the notification has the safetyTriggered property
        const hasSafetyField = notification.embedFields.some(
          (field) => field.name === 'Safety Reason',
        )
        const isSafetyTriggered =
          notification.title.includes('Safety Triggered')
        const hasTriggeredProperty =
          'safetyTriggered' in notification &&
          notification.safetyTriggered === true

        embed = {
          title: notification.title,
          description: 'System notification',
          // Use red for any safety issues, green otherwise
          color:
            hasSafetyField || isSafetyTriggered || hasTriggeredProperty
              ? RED
              : GREEN,
          timestamp: new Date().toISOString(),
          fields: notification.embedFields,
        }
      } else {
        // Handle media notification
        const emoji = notification.type === 'movie' ? '🎬' : '📺'
        let description: string
        const fields: Array<{ name: string; value: string; inline?: boolean }> =
          []

        if (notification.type === 'show' && notification.episodeDetails) {
          const { episodeDetails } = notification

          // Check if it's a single episode (has episode number) or bulk release
          if (
            episodeDetails.episodeNumber !== undefined &&
            episodeDetails.seasonNumber !== undefined
          ) {
            // Single episode release
            description = `New episode available for ${notification.title}! ${emoji}`

            // Format season and episode numbers with padding
            const seasonNum = episodeDetails.seasonNumber
              .toString()
              .padStart(2, '0')
            const episodeNum = episodeDetails.episodeNumber
              .toString()
              .padStart(2, '0')

            // Create episode identifier
            const episodeId = `S${seasonNum}E${episodeNum}`

            // Add episode title if available
            const episodeTitle = episodeDetails.title
              ? ` - ${episodeDetails.title}`
              : ''

            fields.push({
              name: 'Episode',
              value: `${episodeId}${episodeTitle}`,
              inline: false,
            })

            // Add overview if available
            if (episodeDetails.overview) {
              fields.push({
                name: 'Overview',
                value: episodeDetails.overview,
                inline: false,
              })
            }

            // Add air date if available
            if (episodeDetails.airDateUtc) {
              fields.push({
                name: 'Air Date',
                value: new Date(episodeDetails.airDateUtc).toLocaleDateString(),
                inline: true,
              })
            }
          } else if (episodeDetails.seasonNumber !== undefined) {
            // Bulk release
            description = `New season available for ${notification.title}! ${emoji}`
            fields.push({
              name: 'Season Added',
              value: `Season ${episodeDetails.seasonNumber}`,
              inline: true,
            })
          } else {
            // Fallback description if somehow neither condition is met
            description = `New content available for ${notification.title}! ${emoji}`
          }
        } else {
          // Movie notification
          description = `Your movie is available to watch! ${emoji}`
        }

        embed = {
          title: notification.title,
          description,
          color: this.COLOR,
          timestamp: new Date().toISOString(),
          fields,
        }

        if (notification.posterUrl) {
          embed.image = {
            url: notification.posterUrl,
          }
        }
      }

      // Fetch the Discord user and send the message
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

  /**
   * Create an embed for delete sync results
   *
   * @param results - The results of the delete sync operation
   * @param dryRun - Whether this was a dry run
   * @returns The created Discord embed
   */
  private createDeleteSyncEmbed(
    results: {
      total: { deleted: number; skipped: number; processed: number }
      movies: {
        deleted: number
        skipped: number
        items: Array<{ title: string; guid: string; instance: string }>
      }
      shows: {
        deleted: number
        skipped: number
        items: Array<{ title: string; guid: string; instance: string }>
      }
      safetyTriggered?: boolean
      safetyMessage?: string
    },
    dryRun: boolean,
  ): DiscordEmbed {
    let title: string
    let description: string
    // Use red color (0xFF0000) for safety triggers, green (0x00FF00) for successful operations
    const RED = 0xff0000
    const GREEN = 0x00ff00
    const color = results.safetyTriggered === true ? RED : GREEN

    if (results.safetyTriggered) {
      title = '⚠️ Delete Sync Safety Triggered'
      description =
        results.safetyMessage ||
        'A safety check prevented the delete sync operation from running.'
    } else if (dryRun) {
      title = '🔍 Delete Sync Simulation Results'
      description = 'This was a dry run - no content was actually deleted.'
    } else {
      title = '🗑️ Delete Sync Results'
      description =
        "The following content was removed because it's no longer in any user's watchlist."
    }

    // Create fields for the embed
    const fields = [
      {
        name: 'Summary',
        value: `Processed: ${results.total.processed} items\nDeleted: ${results.total.deleted} items\nSkipped: ${results.total.skipped} items`,
        inline: false,
      },
    ]

    // Add safety message field if it exists
    if (results.safetyTriggered && results.safetyMessage) {
      fields.push({
        name: 'Safety Reason',
        value: results.safetyMessage,
        inline: false,
      })
    }

    // Add movies field if any were deleted
    if (results.movies.deleted > 0) {
      const movieList = results.movies.items
        .slice(0, 10) // Limit to 10 items
        .map((item) => `• ${item.title}`)
        .join('\n')

      fields.push({
        name: `Movies (${results.movies.deleted} deleted)`,
        value: movieList || 'None',
        inline: false,
      })

      if (results.movies.items.length > 10) {
        fields.push({
          name: 'Movies (continued)',
          value: `... and ${results.movies.items.length - 10} more`,
          inline: false,
        })
      }
    } else {
      fields.push({
        name: 'Movies',
        value: 'No movies deleted',
        inline: false,
      })
    }

    // Add shows field if any were deleted
    if (results.shows.deleted > 0) {
      const showList = results.shows.items
        .slice(0, 10) // Limit to 10 items
        .map((item) => `• ${item.title}`)
        .join('\n')

      fields.push({
        name: `TV Shows (${results.shows.deleted} deleted)`,
        value: showList || 'None',
        inline: false,
      })

      if (results.shows.items.length > 10) {
        fields.push({
          name: 'TV Shows (continued)',
          value: `... and ${results.shows.items.length - 10} more`,
          inline: false,
        })
      }
    } else {
      fields.push({
        name: 'TV Shows',
        value: 'No TV shows deleted',
        inline: false,
      })
    }

    return {
      title,
      description,
      color, // Use dynamic color based on result
      timestamp: new Date().toISOString(),
      fields,
      footer: {
        text: `Delete sync operation completed at ${new Date().toLocaleString()}`,
      },
    }
  }

  /**
   * Send a notification about delete sync results
   *
   * @param results - The results of the delete sync operation
   * @param dryRun - Whether this was a dry run
   * @returns Promise resolving to true if successful, false otherwise
   */
  async sendDeleteSyncNotification(
    results: {
      total: { deleted: number; skipped: number; processed: number }
      movies: {
        deleted: number
        skipped: number
        items: Array<{ title: string; guid: string; instance: string }>
      }
      shows: {
        deleted: number
        skipped: number
        items: Array<{ title: string; guid: string; instance: string }>
      }
      safetyTriggered?: boolean
      safetyMessage?: string
    },
    dryRun: boolean,
    notifyOption?: string,
  ): Promise<boolean> {
    try {
      // Get notification type from config or parameter
      const notifySetting =
        notifyOption || this.fastify.config.deleteSyncNotify || 'none'

      // Skip all notifications if set to none
      if (notifySetting === 'none') {
        this.log.debug('Delete sync notifications disabled, skipping')
        return false
      }

      // Create the embed for notifications
      const embed = this.createDeleteSyncEmbed(results, dryRun)

      // Track successful sends
      let successCount = 0

      // Determine which notifications to send
      const sendWebhook = [
        'all',
        'discord-only',
        'webhook-only',
        'discord-webhook',
        'discord-both',
        'webhook',
        'both',
      ].includes(notifySetting)
      const sendDM = [
        'all',
        'discord-only',
        'dm-only',
        'discord-message',
        'discord-both',
        'message',
        'both',
      ].includes(notifySetting)

      // Send webhook notification if configured
      if (sendWebhook && this.config.discordWebhookUrl) {
        try {
          const payload = {
            embeds: [embed],
            username: 'Pulsarr Delete Sync',
            avatar_url:
              'https://raw.githubusercontent.com/jamcalli/Pulsarr/master/src/client/assets/images/pulsarr.png',
          }

          const webhookSent = await this.sendNotification(payload)
          if (webhookSent) {
            successCount++
            this.log.info('Delete sync webhook notification sent successfully')
          } else {
            this.log.warn('Failed to send delete sync webhook notification')
          }
        } catch (webhookError) {
          this.log.error('Error sending webhook notification:', webhookError)
        }
      }

      // Send DM notification if configured
      if (sendDM) {
        try {
          // Get all users to find the admin user
          const users = await this.fastify.db.getAllUsers()

          // Find the admin user with username
          const adminUser = users.find((user) => user.is_primary_token)

          // Only send DM notifications if content was deleted or safety was triggered
          const hasDeletedContent = results.total.deleted > 0
          const shouldNotify = hasDeletedContent || results.safetyTriggered

          if (!shouldNotify) {
            this.log.info('Skipping DM notification as no content was deleted')
          } else if (!adminUser || !adminUser.discord_id) {
            // Admin not found or doesn't have a Discord ID
            this.log.warn(
              'Admin user not found or has no Discord ID - skipping delete sync DM notification',
            )
          } else {
            // Admin exists and has a Discord ID - proceed with notification
            try {
              // Create system notification for the delete sync
              const systemNotification: SystemNotification = {
                type: 'system',
                username: adminUser.name,
                title: embed.title || 'Delete Sync Results',
                embedFields: embed.fields || [],
                safetyTriggered: results.safetyTriggered,
              }

              this.log.debug(
                `Attempting to send DM to admin ${adminUser.name} (${adminUser.discord_id})`,
              )
              const dmSent = await this.sendDirectMessage(
                adminUser.discord_id,
                systemNotification,
              )

              if (dmSent) {
                successCount++
                this.log.info(
                  `Sent delete sync DM notification to admin ${adminUser.name}`,
                )
              } else {
                this.log.warn(
                  `Failed to send DM to admin ${adminUser.name} (${adminUser.discord_id})`,
                )
              }
            } catch (dmError) {
              this.log.error(
                `Failed to send delete sync DM notification to admin ${adminUser.name}:`,
                dmError,
              )
            }
          }
        } catch (userError) {
          this.log.error(
            'Error retrieving users for DM notifications:',
            userError,
          )
        }
      }

      return successCount > 0
    } catch (error) {
      this.log.error('Error sending delete sync notification:', error)
      return false
    }
  }
}
