import type { User } from '@root/types/config.types.js'
import type { DatabaseService } from '@services/database.service.js'
import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  type ModalSubmitInteraction,
} from 'discord.js'
import type { FastifyBaseLogger } from 'fastify'
import { SettingsCache } from './cache.js'

export interface FormDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
}

export function createNotificationsEmbed(user: User): EmbedBuilder {
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
          `**Public Mentions**: ${user.notify_discord_mention ? '✅ Enabled' : '❌ Disabled'}`,
          `**Apprise**: ${user.notify_apprise ? '✅ Enabled' : '❌ Disabled'}`,
          `**Plex Mobile**: ${user.notify_plex_mobile ? '✅ Enabled' : '❌ Disabled'}`,
        ].join('\n'),
        inline: false,
      },
    ])
    .setFooter({ text: 'Use the buttons below to modify your settings' })
}

export function createActionRows(
  user: User,
): ActionRowBuilder<ButtonBuilder>[] {
  // Placeholder Apprise values are stored as null, so any value is a real URL
  const hasValidApprise = !!user.apprise
  const appriseButtonDisabled = !hasValidApprise

  const appriseButton = new ButtonBuilder()
    .setCustomId('toggleApprise')
    .setLabel(user.notify_apprise ? 'Disable Apprise' : 'Enable Apprise')
    .setStyle(user.notify_apprise ? ButtonStyle.Success : ButtonStyle.Secondary)
    .setDisabled(appriseButtonDisabled && !user.notify_apprise)

  const plexMobileButton = new ButtonBuilder()
    .setCustomId('togglePlexMobile')
    .setLabel(
      user.notify_plex_mobile ? 'Disable Plex Mobile' : 'Enable Plex Mobile',
    )
    .setStyle(
      user.notify_plex_mobile ? ButtonStyle.Success : ButtonStyle.Secondary,
    )

  const mentionsButton = new ButtonBuilder()
    .setCustomId('toggleMentions')
    .setLabel(
      user.notify_discord_mention ? 'Disable Mentions' : 'Enable Mentions',
    )
    .setStyle(
      user.notify_discord_mention ? ButtonStyle.Success : ButtonStyle.Secondary,
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
    mentionsButton,
    appriseButton,
    plexMobileButton,
  )

  const secondRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('closeSettings')
      .setLabel('Exit')
      .setStyle(ButtonStyle.Danger),
  )

  return [firstRow, secondRow]
}

export async function showSettingsForm(
  interaction:
    | ChatInputCommandInteraction
    | ButtonInteraction
    | ModalSubmitInteraction,
  user: User,
  deps: FormDeps,
): Promise<void> {
  const { logger } = deps
  const cache = SettingsCache.getInstance()
  const messagePayload = {
    embeds: [createNotificationsEmbed(user)],
    components: createActionRows(user),
  }

  try {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        ...messagePayload,
        flags: MessageFlags.Ephemeral,
      })
      cache.set(interaction.user.id)
      logger.debug({ userId: interaction.user.id }, 'New settings form shown')
    } else {
      await interaction.editReply(messagePayload)
      logger.debug({ userId: interaction.user.id }, 'Settings form updated')
    }
  } catch (error) {
    logger.error(
      { error, userId: interaction.user.id },
      'Error showing settings form',
    )
    if ('followUp' in interaction) {
      await interaction.followUp({
        content: 'An error occurred while displaying settings.',
        flags: MessageFlags.Ephemeral,
      })
    }
  }
}
