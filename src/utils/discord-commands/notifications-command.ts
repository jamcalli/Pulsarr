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

// UI Functions
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
          `**Email**: ${user.email || '*Not set*'}`,
        ].join('\n'),
        inline: false,
      },
      {
        name: 'Notification Settings',
        value: [
          `**Discord**: ${user.notify_discord ? '✅ Enabled' : '❌ Disabled'}`,
          `**Email**: ${user.notify_email ? '✅ Enabled' : '❌ Disabled'}`,
        ].join('\n'),
        inline: false,
      },
    ])
    .setFooter({ text: 'Use the buttons below to modify your settings' })
}

function createActionRow(user: User): ActionRowBuilder<ButtonBuilder> {
  // Simply check if email exists - placeholders are already converted to null
  const hasValidEmail = !!user.email
  const emailButtonDisabled = !hasValidEmail

  const emailButton = new ButtonBuilder()
    .setCustomId('toggleEmail')
    .setLabel(user.notify_email ? 'Disable Email' : 'Enable Email')
    .setStyle(user.notify_email ? ButtonStyle.Success : ButtonStyle.Secondary)
    .setDisabled(emailButtonDisabled && !user.notify_email)

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
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
    emailButton,
    new ButtonBuilder()
      .setCustomId('closeSettings')
      .setLabel('Exit')
      .setStyle(ButtonStyle.Danger),
  )
}

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

// Complete replacement for createProfileEditModal function
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

  const emailInput = new TextInputBuilder()
    .setCustomId('email')
    .setLabel('Email Address')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder('Enter your email address')

  if (user.email && !user.email.includes('@placeholder.com')) {
    emailInput.setValue(user.email)
  }

  // Add components to modal
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(aliasInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(emailInput),
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
    if (user) {
      if (user.email?.endsWith('@placeholder.com')) {
        user.email = null
      }
    }
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

// Interaction Handlers
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
    components: [createActionRow(user)],
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

// Button Handler
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

    case 'toggleEmail': {
      await interaction.deferUpdate()
      const emailUpdated = await updateUser(
        user.id,
        { notify_email: !user.notify_email },
        context,
      )
      if (emailUpdated) {
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

// Modal Handlers
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
        components: [createActionRow(updatedUser)],
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

export async function handleProfileEditModal(
  interaction: ModalSubmitInteraction,
  context: CommandContext,
) {
  const alias = interaction.fields.getTextInputValue('alias')
  const email = interaction.fields.getTextInputValue('email')

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
      { userId: user.id, alias, email },
      'Updating user profile',
    )

    await interaction.deferUpdate()

    const updated = await updateUser(
      user.id,
      {
        alias: alias || null,
        email: email || null,
      },
      context,
    )

    if (updated) {
      const updatedUser = await getUser(interaction.user.id, context)
      if (updatedUser) {
        const messagePayload = {
          embeds: [createNotificationsEmbed(updatedUser)],
          components: [createActionRow(updatedUser)],
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
