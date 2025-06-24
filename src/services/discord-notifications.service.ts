import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  type SlashCommandBuilder,
  type InteractionReplyOptions,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type {
  MediaNotification,
  DiscordEmbed,
  DiscordWebhookPayload,
  SystemNotification,
} from '@root/types/discord.types.js'
import { getPublicContentUrls } from '@root/utils/notification-processor.js'
import {
  notificationsCommand,
  handleNotificationButtons,
  handlePlexUsernameModal,
  handleProfileEditModal,
} from '@root/utils/discord-commands/notifications-command.js'
import {
  approvalCommand,
  handleApprovalButtons,
} from '@root/utils/discord-commands/approval-command.js'

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

      this.commands.set('approvals', {
        data: approvalCommand.data,
        execute: async (interaction) => {
          this.log.debug(
            { userId: interaction.user.id },
            'Executing approvals command',
          )
          await approvalCommand.execute(interaction, {
            fastify: this.fastify,
            log: this.log,
          })
        },
      })

      this.log.info('Discord bot commands initialized')
    } catch (error) {
      this.log.error({ error }, 'Failed to initialize bot commands')
      throw error
    }
  }

  private async registerCommands(): Promise<boolean> {
    this.log.info('Registering Discord application commands globally')
    try {
      const config = this.botConfig
      const rest = new REST().setToken(config.token)

      const commandsData = Array.from(this.commands.values()).map((cmd) =>
        cmd.data.toJSON(),
      )

      // Clear old guild commands first (cleanup from previous registration method)
      try {
        await rest.put(
          Routes.applicationGuildCommands(config.clientId, config.guildId),
          { body: [] },
        )
        this.log.info('Cleared old guild-specific commands')
      } catch (error) {
        this.log.warn({ error }, 'Failed to clear old guild commands (may not exist)')
      }

      // Register commands globally for DM support
      await rest.put(Routes.applicationCommands(config.clientId), {
        body: commandsData,
      })

      this.log.info('Successfully registered global application commands')
      return true
    } catch (error) {
      this.log.error({ error }, 'Failed to register global commands')
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
            'Handling button interaction',
          )

          // Route button interactions based on prefix
          if (interaction.customId.startsWith('approval_')) {
            await handleApprovalButtons(interaction, {
              fastify: this.fastify,
              log: this.log,
            })
          } else if (interaction.customId.startsWith('review_approvals_')) {
            // Handle "Review Approvals" button - trigger the approvals flow
            await this.handleReviewApprovalsButton(interaction)
          } else {
            await handleNotificationButtons(interaction, {
              fastify: this.fastify,
              log: this.log,
            })
          }
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

  async sendNotification(
    payload: DiscordWebhookPayload,
    overrideUrls?: string[],
  ): Promise<boolean> {
    let webhookUrls: string[]

    if (overrideUrls) {
      // Use provided URLs directly
      webhookUrls = overrideUrls.filter((url) => url.trim().length > 0)
      if (webhookUrls.length === 0) {
        this.log.debug('No valid override webhook URLs provided')
        return false
      }
    } else {
      // Use config URLs (existing behavior)
      if (!this.config.discordWebhookUrl) {
        this.log.debug(
          'Attempted to send notification without webhook URL configured',
        )
        return false
      }

      // Trim the input string first to handle whitespace-only input
      const trimmedInput = this.config.discordWebhookUrl?.trim() ?? ''
      if (trimmedInput.length === 0) {
        this.log.debug('Webhook URL is empty or contains only whitespace')
        return false
      }

      // Split webhook URLs by comma, trim whitespace, and deduplicate
      webhookUrls = [
        ...new Set(
          trimmedInput
            .split(',')
            .map((url) => url.trim())
            .filter((url) => url.length > 0),
        ),
      ]

      if (webhookUrls.length === 0) {
        this.log.debug('No valid webhook URLs found after parsing')
        return false
      }
    }

    try {
      const endpointWord = webhookUrls.length === 1 ? 'endpoint' : 'endpoints'
      this.log.debug(
        { webhookCount: webhookUrls.length, payload },
        `Sending Discord webhook notification to ${webhookUrls.length} ${endpointWord}`,
      )

      // Use Promise.all with error handling inside each promise
      const results = await Promise.all(
        webhookUrls.map(async (webhookUrl) => {
          try {
            const response = await fetch(webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })

            if (!response.ok) {
              this.log.warn(
                { url: webhookUrl, status: response.status },
                'Discord webhook request failed for one endpoint',
              )
              return false
            }
            return true
          } catch (error) {
            this.log.warn(
              { url: webhookUrl, error },
              'Error sending to one Discord webhook endpoint',
            )
            return false
          }
        }),
      )

      // Count successful (true) results
      const successCount = results.filter(Boolean).length

      const totalEndpoints = webhookUrls.length
      const allSucceeded = successCount === totalEndpoints
      const someSucceeded = successCount > 0

      if (allSucceeded) {
        this.log.info(
          `Discord webhooks sent successfully to all ${totalEndpoints} endpoints`,
        )
        return true
      }

      if (someSucceeded) {
        this.log.warn(
          `Discord webhooks sent to ${successCount}/${totalEndpoints} endpoints`,
        )
        return true // Return true as long as at least one succeeded
      }

      this.log.error('All Discord webhook requests failed')
      return false
    } catch (error) {
      this.log.error({ error }, 'Error in Discord webhook processing')
      return false
    }
  }

  /**
   * Create media notification embed with consistent formatting
   * Centralized logic used by both public and direct message notifications
   */
  private createMediaNotificationEmbed(
    notification: MediaNotification,
  ): DiscordEmbed {
    const emoji = notification.type === 'movie' ? '🎬' : '📺'
    let description: string
    const fields: Array<{ name: string; value: string; inline?: boolean }> = []

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
      // Movie notification - impersonal for consistency
      description = `Movie available to watch! ${emoji}`
    }

    const embed: DiscordEmbed = {
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

    return embed
  }

  /**
   * Send public content notification with @ mentions for users who have the content watchlisted
   * Uses the same formatting as direct messages for consistency
   */
  async sendPublicNotification(
    notification: MediaNotification,
    userDiscordIds?: string[],
  ): Promise<boolean> {
    const config = this.config.publicContentNotifications
    if (!config?.enabled) return false

    // Use centralized URL configuration utility
    const webhookUrls = getPublicContentUrls(
      config,
      notification.type,
      'discord',
    )

    // If no URLs configured, don't send anything
    if (webhookUrls.length === 0) return false

    // Create embed using centralized method for consistency
    const embed = this.createMediaNotificationEmbed(notification)

    // Create @ mentions content
    let content = ''
    if (userDiscordIds && userDiscordIds.length > 0) {
      const mentions = userDiscordIds.map((id) => `<@${id}>`).join(' ')
      content = `${mentions} 👋`
    }

    const payload: DiscordWebhookPayload = {
      content,
      embeds: [embed],
      username: 'Pulsarr',
      avatar_url:
        'https://raw.githubusercontent.com/jamcalli/Pulsarr/master/src/client/assets/images/pulsarr.png',
    }

    // Send notification using existing service method with custom payload
    return await this.sendNotification(payload, webhookUrls)
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

  /**
   * Validates a Discord webhook URL
   * @param url The Discord webhook URL to validate
   * @returns Object indicating if the webhook is valid with optional error message
   */
  async validateWebhook(
    url: string,
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      // Validate URL structure properly with URL parser
      let parsedUrl: URL
      try {
        parsedUrl = new URL(url)
      } catch (e) {
        return { valid: false, error: 'Invalid URL format' }
      }

      // Ensure it's a proper Discord webhook URL
      if (
        parsedUrl.protocol !== 'https:' ||
        !parsedUrl.hostname.endsWith('discord.com') ||
        !parsedUrl.pathname.startsWith('/api/webhooks/')
      ) {
        return { valid: false, error: 'Invalid Discord webhook URL format' }
      }

      // Check port if explicitly specified (should be 443 for HTTPS)
      if (parsedUrl.port && parsedUrl.port !== '443') {
        return { valid: false, error: 'Invalid port for Discord webhook' }
      }

      // Use GET request instead of POST to validate the webhook URL
      // This avoids creating test messages in Discord channels
      // GET returns webhook metadata (id, token, etc.) if valid
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        return {
          valid: false,
          error: `Request failed with status ${response.status}: ${response.statusText}`,
        }
      }

      return { valid: true }
    } catch (error) {
      this.log.error({ error, url }, 'Error validating webhook')
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
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
        // Handle media notification using centralized method
        embed = this.createMediaNotificationEmbed(notification)
      }

      // Fetch the Discord user and send the message
      const user = await this.botClient.users.fetch(discordId)
      if (!user) {
        this.log.warn({ discordId }, 'Could not find Discord user')
        return false
      }

      // Prepare message payload
      const messagePayload: {
        content: string
        embeds: DiscordEmbed[]
        components?: ActionRowBuilder<ButtonBuilder>[]
      } = {
        content: `Hey ${user}! 👋`,
        embeds: [embed],
      }

      // Add action button if present (only for system notifications)
      if (notification.type === 'system' && notification.actionButton) {
        const button = new ButtonBuilder()
          .setCustomId(notification.actionButton.customId)
          .setLabel(notification.actionButton.label)
          .setStyle(ButtonStyle[notification.actionButton.style])

        const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          button,
        )

        messagePayload.components = [actionRow]
      }

      await user.send(messagePayload)

      this.log.info(
        `Discord notification sent successfully to ${user.username} for "${notification.title}"`,
      )

      return true
    } catch (error) {
      this.log.error({ error, discordId }, 'Failed to send direct message')
      return false
    }
  }

  /**
   * Handle "Review Approvals" button click - triggers the approval flow
   */
  private async handleReviewApprovalsButton(
    interaction: ButtonInteraction,
  ): Promise<void> {
    try {
      // Check if user is primary admin
      const users = await this.fastify.db.getAllUsers()
      const user = users.find((u) => u.discord_id === interaction.user.id)

      if (!user?.is_primary_token) {
        await interaction.reply({
          content: '❌ You are not authorized to review approvals.',
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      this.log.debug(
        { userId: interaction.user.id },
        'Primary admin clicked Review Approvals button',
      )

      // Get all pending approval requests
      const pendingApprovals =
        await this.fastify.db.getPendingApprovalRequests()

      if (pendingApprovals.length === 0) {
        await interaction.reply({
          content: '✅ No pending approval requests found!',
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      // Import and use the showApprovalAtIndex function directly
      const { showApprovalAtIndex } = await import(
        '@root/utils/discord-commands/approval-command.js'
      )

      // Start with the first approval (index 0) - make it ephemeral
      await showApprovalAtIndex(
        interaction,
        0,
        pendingApprovals,
        this.fastify,
        this.log,
        true,
      )
    } catch (error) {
      this.log.error({ error }, 'Error handling review approvals button')

      if (!interaction.replied) {
        await interaction.reply({
          content: '❌ Error starting approval review',
          flags: MessageFlags.Ephemeral,
        })
      }
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
      total: {
        deleted: number
        skipped: number
        processed: number
        protected?: number
      }
      movies: {
        deleted: number
        skipped: number
        protected?: number
        items: Array<{ title: string; guid: string; instance: string }>
      }
      shows: {
        deleted: number
        skipped: number
        protected?: number
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

    // Add protected playlist information if there are protected items
    if (results.total.protected && results.total.protected > 0) {
      description += `\n\n${results.total.protected} items were preserved because they are in protected playlists.`
    }

    // Create fields for the embed
    const fields = [
      {
        name: 'Summary',
        value: `Processed: ${results.total.processed} items\nDeleted: ${results.total.deleted} items\nSkipped: ${results.total.skipped} items${results.total.protected ? `\nProtected: ${results.total.protected} items` : ''}`,
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

      // Include protected count if available
      const protectedInfo =
        results.movies.protected && results.movies.protected > 0
          ? ` (${results.movies.protected} protected)`
          : ''

      fields.push({
        name: `Movies (${results.movies.deleted} deleted${protectedInfo})`,
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
      // Include protected count if available
      const protectedInfo =
        results.movies.protected && results.movies.protected > 0
          ? ` (${results.movies.protected} protected)`
          : ''

      fields.push({
        name: 'Movies',
        value: `No movies deleted${protectedInfo}`,
        inline: false,
      })
    }

    // Add shows field if any were deleted
    if (results.shows.deleted > 0) {
      const showList = results.shows.items
        .slice(0, 10) // Limit to 10 items
        .map((item) => `• ${item.title}`)
        .join('\n')

      // Include protected count if available
      const protectedInfo =
        results.shows.protected && results.shows.protected > 0
          ? ` (${results.shows.protected} protected)`
          : ''

      fields.push({
        name: `TV Shows (${results.shows.deleted} deleted${protectedInfo})`,
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
      // Include protected count if available
      const protectedInfo =
        results.shows.protected && results.shows.protected > 0
          ? ` (${results.shows.protected} protected)`
          : ''

      fields.push({
        name: 'TV Shows',
        value: `No TV shows deleted${protectedInfo}`,
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
      total: {
        deleted: number
        skipped: number
        processed: number
        protected?: number
      }
      movies: {
        deleted: number
        skipped: number
        protected?: number
        items: Array<{ title: string; guid: string; instance: string }>
      }
      shows: {
        deleted: number
        skipped: number
        protected?: number
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

      // Log the notification setting to help with debugging
      this.log.info(`Delete sync notification setting: "${notifySetting}"`)

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

      // Log which notification methods will be attempted
      this.log.debug(
        `Will attempt to send notifications: Webhook=${sendWebhook}, DM=${sendDM}`,
      )

      // Send webhook notification if configured
      if (sendWebhook) {
        if (!this.config.discordWebhookUrl) {
          this.log.warn(
            'Discord webhook URL not configured, cannot send webhook notification',
          )
        } else {
          try {
            const payload = {
              embeds: [embed],
              username: 'Pulsarr Delete Sync',
              avatar_url:
                'https://raw.githubusercontent.com/jamcalli/Pulsarr/master/src/client/assets/images/pulsarr.png',
            }

            this.log.debug('Attempting to send webhook notification')
            const webhookSent = await this.sendNotification(payload)
            if (webhookSent) {
              successCount++
              this.log.info(
                'Delete sync webhook notification sent successfully',
              )
            } else {
              this.log.warn('Failed to send delete sync webhook notification')
            }
          } catch (webhookError) {
            this.log.error('Error sending webhook notification:', webhookError)
          }
        }
      }

      // Send DM notification if configured
      if (sendDM) {
        try {
          // Get all users to find the admin user
          const users = await this.fastify.db.getAllUsers()

          // Find the admin user with username
          const adminUser = users.find((user) => user.is_primary_token)

          // Always send DM for dry runs or if there's any activity
          // Changed this to be more permissive to fix the issue with "both" setting
          const hasDeletedContent = results.total.deleted > 0
          const hasSkippedContent = results.total.skipped > 0
          const shouldNotify =
            dryRun ||
            hasDeletedContent ||
            hasSkippedContent ||
            results.safetyTriggered

          if (!shouldNotify) {
            this.log.info('Skipping DM notification as no activity to report')
          } else if (!adminUser) {
            this.log.warn(
              'Admin user not found - skipping delete sync DM notification',
            )
          } else if (!adminUser.discord_id) {
            this.log.warn(
              `Admin user ${adminUser.name} has no Discord ID - skipping delete sync DM notification`,
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

      this.log.info(
        `Notification attempt complete: ${successCount} messages sent successfully`,
      )
      return successCount > 0
    } catch (error) {
      this.log.error('Error sending delete sync notification:', error)
      return false
    }
  }
}
