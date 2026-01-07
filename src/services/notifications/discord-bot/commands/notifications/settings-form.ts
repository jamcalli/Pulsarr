/**
 * Notifications Command Settings Form
 *
 * Embed and action row builders for the notification settings UI.
 */

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

/**
 * Creates an embed displaying a user's profile and notification settings.
 */
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
          `**Tautulli**: ${user.notify_tautulli ? '✅ Enabled' : '❌ Disabled'}`,
        ].join('\n'),
        inline: false,
      },
    ])
    .setFooter({ text: 'Use the buttons below to modify your settings' })
}

/**
 * Creates action rows with buttons for managing notification settings.
 *
 * The Apprise toggle button is disabled if the user does not have a valid
 * Apprise URL and Apprise notifications are not currently enabled.
 */
export function createActionRows(
  user: User,
): ActionRowBuilder<ButtonBuilder>[] {
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
    tautulliButton,
  )

  const secondRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('closeSettings')
      .setLabel('Exit')
      .setStyle(ButtonStyle.Danger),
  )

  return [firstRow, secondRow]
}

/**
 * Displays or updates the user's notification settings form as an ephemeral message.
 */
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
      const _response = await interaction.reply({
        ...messagePayload,
        flags: MessageFlags.Ephemeral,
      })
      cache.set(interaction.user.id, interaction.id)
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
