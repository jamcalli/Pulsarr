import {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  MessageFlags as DiscordMessageFlags,
} from 'discord.js'
import { MessageFlags } from 'discord-api-types/v10'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { User } from '@root/types/config.types.js'
import type { DatabaseService } from '@root/services/database.service.js'

// Types
interface CommandContext {
  fastify: FastifyInstance
  log: FastifyBaseLogger
}

// Cache Singleton
class SettingsCache {
  private static instance: SettingsCache
  private cache: Map<string, { messageId: string; timestamp: number }> =
    new Map()
  private cleanupInterval: NodeJS.Timeout
  private readonly SESSION_TIMEOUT = 15 * 60 * 1000 // 15 minutes

  private constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000)
  }

  static getInstance(): SettingsCache {
    if (!SettingsCache.instance) {
      SettingsCache.instance = new SettingsCache()
    }
    return SettingsCache.instance
  }

  has(userId: string): boolean {
    const entry = this.cache.get(userId)
    if (!entry) return false

    if (Date.now() - entry.timestamp > this.SESSION_TIMEOUT) {
      this.delete(userId)
      return false
    }
    return true
  }

  set(userId: string, messageId: string): void {
    this.cache.set(userId, {
      messageId,
      timestamp: Date.now(),
    })
  }

  delete(userId: string): void {
    this.cache.delete(userId)
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [userId, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.SESSION_TIMEOUT) {
        this.cache.delete(userId)
      }
    }
  }
}

/**
 * Creates an embed displaying a user's profile and notification settings for Discord, Apprise, and Tautulli.
 *
 * @param user - The user whose notification settings and profile information will be shown.
 * @returns An {@link EmbedBuilder} containing the user's profile details and current notification preferences.
 */
function createNotificationsEmbed(user: User): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('Notification Settings')
    .setColor(0x48a9a6)
    .setDescription(
      'Configure your notification preferences and profile settings below.',
    )
    .addFields([
      {
        name: 'Profile Information',
        value: [
          `**Plex Username**: ${user.name}`,
          `**Display Name**: ${user.alias || '*Not set*'}`,
          `**Apprise**: ${user.apprise || '*Not set*'}`,
        ].join('\n'),
        inline: false,
      },
      {
        name: 'Notification Settings',
        value: [
          `**Discord**: ${user.notify_discord ? '✅ Enabled' : '❌ Disabled'}`,
          `**Apprise**: ${user.notify_apprise ? '✅ Enabled' : '❌ Disabled'}`,
          `**Tautulli**: ${user.notify_tautulli ? '✅ Enabled' : '❌ Disabled'}`,
        ].join('\n'),
        inline: false,
      },
    ])
    .setFooter({ text: 'Use the buttons below to modify your settings' })
}

/**
 * Creates an array of action rows containing buttons for managing user notification settings and profile actions.
 *
 * The buttons allow toggling Discord, Apprise, and Tautulli notifications, editing the user profile, and exiting the settings interface. The Apprise toggle button is disabled if the user does not have a valid Apprise URL and Apprise notifications are not currently enabled.
 *
 * @param user - The user whose notification and profile settings are being managed.
 * @returns An array of action rows with interactive buttons for the notification settings UI.
 */
function createActionRows(user: User): ActionRowBuilder<ButtonBuilder>[] {
  // Simply check if apprise exists - placeholders are already converted to null
  const hasValidApprise = !!user.apprise
  const appriseButtonDisabled = !hasValidApprise

  const appriseButton = new ButtonBuilder()
    .setCustomId('toggleApprise')
    .setLabel(user.notify_apprise ? 'Disable Apprise' : 'Enable Apprise')
    .setStyle(user.notify_apprise ? ButtonStyle.Success : ButtonStyle.Secondary)
    .setDisabled(appriseButtonDisabled && !user.notify_apprise)

  const tautulliButton = new ButtonBuilder()
    .setCustomId('toggleTautulli')
    .setLabel(user.notify_tautulli ? 'Disable Tautulli' : 'Enable Tautulli')
    .setStyle(
      user.notify_tautulli ? ButtonStyle.Success : ButtonStyle.Secondary,
    )

  const firstRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('editProfile')
      .setLabel('Edit Profile')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('toggleDiscord')
      .setLabel(user.notify_discord ? 'Disable Discord' : 'Enable Discord')
      .setStyle(
        user.notify_discord ? ButtonStyle.Success : ButtonStyle.Secondary,
      ),
    appriseButton,
    tautulliButton,
    new ButtonBuilder()
      .setCustomId('closeSettings')
      .setLabel('Exit')
      .setStyle(ButtonStyle.Danger),
  )

  return [firstRow]
}

/**
 * Creates a modal dialog prompting the user to enter their Plex username for account linking.
 *
 * @returns A {@link ModalBuilder} configured for Plex username input.
 */
function createPlexLinkModal(): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId('plexUsernameModal')
    .setTitle('Link Plex Account')
  const usernameInput = new TextInputBuilder()
    .setCustomId('plexUsername')
    .setLabel('Enter your Plex username')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('Your Plex username')
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(usernameInput),
  )
  return modal
}

function createProfileEditModal(user: User): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId('editProfileModal')
    .setTitle('Edit Profile')

  const aliasInput = new TextInputBuilder()
    .setCustomId('alias')
    .setLabel('Display Name')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue(user.alias || '')
    .setPlaceholder('Enter a display name')

  const appriseInput = new TextInputBuilder()
    .setCustomId('apprise')
    .setLabel('Apprise URL')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder('Enter your Apprise URL')

  if (user.apprise) {
    appriseInput.setValue(user.apprise)
  }

  // Add components to modal
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(aliasInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(appriseInput),
  )

  return modal
}

// Database Operations
async function getUser(
  discordId: string,
  context: CommandContext,
): Promise<User | null> {
  try {
    const users = await context.fastify.db.getAllUsers()
    const user = users.find((u) => u.discord_id === discordId)
    context.log.debug(
      { discordId, found: !!user },
      'Looking up user by Discord ID',
    )
    return user || null
  } catch (error) {
    context.log.error({ error, discordId }, 'Error getting user')
    return null
  }
}

async function updateUser(
  userId: number,
  updateData: Partial<User>,
  context: CommandContext,
): Promise<boolean> {
  try {
    await context.fastify.db.updateUser(userId, updateData)
    context.log.debug({ userId, updateData }, 'User updated successfully')
    return true
  } catch (error) {
    context.log.error({ error, userId, updateData }, 'Error updating user')
    return false
  }
}

/**
 * Displays or updates the user's notification settings form as an ephemeral Discord message.
 *
 * Shows the current notification preferences and action buttons for the user. If the interaction has not yet been replied to or deferred, sends a new ephemeral message and tracks the session in the cache; otherwise, updates the existing message. On error, logs the issue and sends an ephemeral error message to the user.
 */
async function showSettingsForm(
  interaction:
    | ChatInputCommandInteraction
    | ButtonInteraction
    | ModalSubmitInteraction,
  user: User,
  context: CommandContext,
): Promise<void> {
  const cache = SettingsCache.getInstance()
  const messagePayload = {
    embeds: [createNotificationsEmbed(user)],
    components: createActionRows(user),
  }

  try {
    if (!interaction.replied && !interaction.deferred) {
      const response = await interaction.reply({
        ...messagePayload,
        flags: DiscordMessageFlags.Ephemeral,
      })
      cache.set(interaction.user.id, interaction.id)
      context.log.debug(
        { userId: interaction.user.id },
        'New settings form shown',
      )
    } else {
      await interaction.editReply(messagePayload)
      context.log.debug(
        { userId: interaction.user.id },
        'Settings form updated',
      )
    }
  } catch (error) {
    context.log.error(
      { error, userId: interaction.user.id },
      'Error showing settings form',
    )
    if ('followUp' in interaction) {
      await interaction.followUp({
        content: 'An error occurred while displaying settings.',
        flags: DiscordMessageFlags.Ephemeral,
      })
    }
  }
}

// Command Export
export const notificationsCommand = {
  data: new SlashCommandBuilder()
    .setName('notifications')
    .setDescription('Configure your notification preferences'),

  async execute(
    interaction: ChatInputCommandInteraction,
    context: CommandContext,
  ) {
    context.log.info(
      { userId: interaction.user.id },
      'User accessed notification settings',
    )
    try {
      const user = await getUser(interaction.user.id, context)

      if (!user) {
        context.log.debug(
          { userId: interaction.user.id },
          'No linked user found, showing Plex link modal',
        )
        await interaction.showModal(createPlexLinkModal())
        return
      }

      await showSettingsForm(interaction, user, context)
    } catch (error) {
      context.log.error(
        { error, userId: interaction.user.id },
        'Error in notifications command',
      )
      await interaction.reply({
        content: 'An error occurred while processing your request.',
        flags: MessageFlags.Ephemeral,
      })
    }
  },
}

/**
 * Handles button interactions for the notifications settings UI, allowing users to toggle notification preferences, edit their profile, or close the settings session.
 *
 * Responds to button presses for toggling Discord, Apprise, and Tautulli notifications, editing the user profile, and closing the settings form. Ensures session validity and user existence before processing actions.
 *
 * @remark If the user's session has expired or the user is not found, prompts the user to restart the process or link their Plex account.
 */
export async function handleNotificationButtons(
  interaction: ButtonInteraction,
  context: CommandContext,
) {
  const cache = SettingsCache.getInstance()

  // Check if this is a dynamic retry button (they start with retryPlexLink_)
  if (interaction.customId.startsWith('retryPlexLink_')) {
    // This is now handled by the collector in the modal handler
    return
  }

  if (!cache.has(interaction.user.id)) {
    context.log.debug(
      { userId: interaction.user.id },
      'Session expired, requiring new command',
    )
    await interaction.reply({
      content:
        'Your session has expired. Please use /notifications to start a new session.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const user = await getUser(interaction.user.id, context)
  if (!user) {
    context.log.debug(
      { userId: interaction.user.id },
      'No user found, showing Plex link modal',
    )
    await interaction.showModal(createPlexLinkModal())
    return
  }

  switch (interaction.customId) {
    case 'toggleDiscord': {
      await interaction.deferUpdate()
      const newDiscordState = !user.notify_discord
      context.log.info(
        { userId: user.id, enabled: newDiscordState },
        'Updating Discord notification preference',
      )
      const discordUpdated = await updateUser(
        user.id,
        { notify_discord: newDiscordState },
        context,
      )
      if (discordUpdated) {
        const updatedUser = await getUser(interaction.user.id, context)
        if (updatedUser) {
          await showSettingsForm(interaction, updatedUser, context)
        }
      }
      break
    }

    case 'toggleApprise': {
      await interaction.deferUpdate()
      const appriseUpdated = await updateUser(
        user.id,
        { notify_apprise: !user.notify_apprise },
        context,
      )
      if (appriseUpdated) {
        const updatedUser = await getUser(interaction.user.id, context)
        if (updatedUser) {
          await showSettingsForm(interaction, updatedUser, context)
        }
      }
      break
    }

    case 'toggleTautulli': {
      await interaction.deferUpdate()
      const newTautulliState = !user.notify_tautulli
      context.log.info(
        { userId: user.id, enabled: newTautulliState },
        'Updating Tautulli notification preference',
      )
      const tautulliUpdated = await updateUser(
        user.id,
        { notify_tautulli: newTautulliState },
        context,
      )
      if (tautulliUpdated) {
        const updatedUser = await getUser(interaction.user.id, context)
        if (updatedUser) {
          await showSettingsForm(interaction, updatedUser, context)
        }
      }
      break
    }

    case 'editProfile': {
      await interaction.showModal(createProfileEditModal(user))
      break
    }

    case 'closeSettings': {
      await interaction.update({
        content: 'Settings saved. Happy watching!',
        embeds: [],
        components: [],
      })
      cache.delete(interaction.user.id)
      context.log.debug(
        { userId: interaction.user.id },
        'Settings session closed',
      )
      break
    }
  }
}

/**
 * Handles the submission of the Plex username modal to link a Discord user with a Plex account.
 *
 * If the provided Plex username does not exist or is already linked to another Discord user, displays an error embed with a retry option. On successful linking, updates the database and shows the user's notification settings.
 *
 * @param interaction - The modal submit interaction containing the Plex username.
 * @param context - The command context for logging and database access.
 */
export async function handlePlexUsernameModal(
  interaction: ModalSubmitInteraction,
  context: CommandContext,
) {
  const plexUsername = interaction.fields
    .getTextInputValue('plexUsername')
    .trim()

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  try {
    context.log.info(
      { userId: interaction.user.id },
      'Attempting to link Discord account with Plex',
    )
    const users = await context.fastify.db.getAllUsers()
    const matchingUser = users.find(
      (u) => u.name.toLowerCase() === plexUsername.toLowerCase(),
    )

    if (!matchingUser) {
      context.log.warn(
        { plexUsername, userId: interaction.user.id },
        'Failed to find matching Plex account',
      )
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Account Link Failed')
        .setColor(0xff0000)
        .setDescription('Unable to find a Plex account with that username.')
        .addFields({
          name: 'What to do next',
          value:
            'Please ensure:\n• Your Plex username is spelled correctly\n• You have an active Plex account\n• Your account has been added to the server',
        })

      const retryId = `retryPlexLink_${Date.now()}`

      await interaction.editReply({
        embeds: [errorEmbed],
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(retryId)
              .setLabel('Try Again')
              .setStyle(ButtonStyle.Primary),
          ),
        ],
      })

      if (interaction.channel) {
        const collector = interaction.channel.createMessageComponentCollector({
          filter: (i) =>
            i.customId === retryId && i.user.id === interaction.user.id,
          time: 15 * 60 * 1000, // 15 minute timeout
          max: 1, // Collect only one interaction
        })

        collector.on('collect', async (buttonInteraction) => {
          try {
            await interaction.deleteReply()
            await buttonInteraction.showModal(createPlexLinkModal())
          } catch (error) {
            context.log.error(
              { error, userId: buttonInteraction.user.id },
              'Error handling retry button',
            )
            await buttonInteraction.reply({
              content:
                'An error occurred. Please try the /notifications command again.',
              flags: MessageFlags.Ephemeral,
            })
          }
        })
      }

      return
    }

    if (
      matchingUser.discord_id &&
      matchingUser.discord_id !== interaction.user.id
    ) {
      context.log.warn(
        {
          plexUsername,
          userId: interaction.user.id,
          existingDiscordId: matchingUser.discord_id,
        },
        'Plex account already linked to another Discord user',
      )

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Account Link Failed')
        .setColor(0xff0000)
        .setDescription(
          'This Plex account is already linked to another Discord user.',
        )
        .addFields({
          name: 'What to do next',
          value:
            'Please ensure:\n• You are using your own Plex username\n• Contact an administrator if you believe this is an error',
        })

      const retryId = `retryPlexLink_${Date.now()}`

      await interaction.editReply({
        embeds: [errorEmbed],
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(retryId)
              .setLabel('Try Different Username')
              .setStyle(ButtonStyle.Primary),
          ),
        ],
      })

      if (interaction.channel) {
        const collector = interaction.channel.createMessageComponentCollector({
          filter: (i) =>
            i.customId === retryId && i.user.id === interaction.user.id,
          time: 15 * 60 * 1000, // 15 minute timeout
          max: 1, // Collect only one interaction
        })

        collector.on('collect', async (buttonInteraction) => {
          try {
            await interaction.deleteReply()
            await buttonInteraction.showModal(createPlexLinkModal())
          } catch (error) {
            context.log.error(
              { error, userId: buttonInteraction.user.id },
              'Error handling retry button',
            )
            await buttonInteraction.reply({
              content:
                'An error occurred. Please try the /notifications command again.',
              flags: MessageFlags.Ephemeral,
            })
          }
        })
      }

      return
    }

    context.log.info(
      { plexUsername, userId: interaction.user.id },
      'Successfully linked Discord account to Plex user',
    )

    await updateUser(
      matchingUser.id,
      { discord_id: interaction.user.id },
      context,
    )
    const updatedUser = await getUser(interaction.user.id, context)

    if (updatedUser) {
      const cache = SettingsCache.getInstance()
      cache.set(interaction.user.id, interaction.id)

      const messagePayload = {
        embeds: [createNotificationsEmbed(updatedUser)],
        components: createActionRows(updatedUser),
      }
      await interaction.editReply(messagePayload)
    }
  } catch (error) {
    context.log.error(
      { error, plexUsername, userId: interaction.user.id },
      'Error processing Plex username',
    )
    await interaction.editReply({
      content: 'An error occurred while processing your request.',
    })
  }
}

/**
 * Handles submission of the profile edit modal, updating the user's alias and Apprise URL.
 *
 * Retrieves the submitted alias and Apprise URL, updates the user's profile in the database, and refreshes the notification settings form with the updated information. If the user is not found or an error occurs, sends an ephemeral error message.
 */
export async function handleProfileEditModal(
  interaction: ModalSubmitInteraction,
  context: CommandContext,
) {
  const alias = interaction.fields.getTextInputValue('alias')
  const apprise = interaction.fields.getTextInputValue('apprise')

  context.log.info(
    { userId: interaction.user.id },
    'Processing profile update request',
  )

  try {
    const user = await getUser(interaction.user.id, context)
    if (!user) {
      context.log.warn(
        { userId: interaction.user.id },
        'Attempted to edit profile for non-existent user',
      )
      await interaction.reply({
        content:
          'Unable to find your user profile. Please try using /notifications again.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    context.log.debug(
      { userId: user.id, alias, apprise },
      'Updating user profile',
    )

    await interaction.deferUpdate()

    const updated = await updateUser(
      user.id,
      {
        alias: alias || null,
        apprise: apprise || null,
      },
      context,
    )

    if (updated) {
      const updatedUser = await getUser(interaction.user.id, context)
      if (updatedUser) {
        const messagePayload = {
          embeds: [createNotificationsEmbed(updatedUser)],
          components: createActionRows(updatedUser),
        }
        await interaction.editReply(messagePayload)
        context.log.debug(
          { userId: updatedUser.id },
          'Profile settings form updated',
        )
        return
      }
    }

    context.log.error(
      { userId: user.id },
      'Failed to update or retrieve user after profile edit',
    )
    await interaction.followUp({
      content: 'An error occurred while updating your profile.',
      flags: MessageFlags.Ephemeral,
    })
  } catch (error) {
    context.log.error(
      { error, userId: interaction.user.id },
      'Error in profile edit modal handler',
    )
    await interaction.followUp({
      content: 'An error occurred while processing your request.',
      flags: MessageFlags.Ephemeral,
    })
  }
}
