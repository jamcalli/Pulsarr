/**
 * Discord Direct Message Channel
 *
 * Functions for sending direct messages via the Discord bot.
 * Requires an active bot client to send DMs.
 */

import type {
  DiscordEmbed,
  MediaNotification,
  SystemNotification,
} from '@root/types/discord.types.js'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Client,
} from 'discord.js'
import type { FastifyBaseLogger } from 'fastify'
import {
  createMediaNotificationEmbed,
  createSystemEmbed,
} from '../templates/discord-embeds.js'

export interface DiscordDmDeps {
  log: FastifyBaseLogger
  botClient: Client | null
  botStatus: 'stopped' | 'starting' | 'running' | 'stopping'
}

/**
 * Sends a direct message to a Discord user.
 *
 * @param discordId - The Discord user ID to message
 * @param notification - The notification payload (media or system)
 * @param deps - Dependencies (bot client, logger)
 * @returns true if the message was sent successfully
 */
export async function sendDirectMessage(
  discordId: string,
  notification: MediaNotification | SystemNotification,
  deps: DiscordDmDeps,
): Promise<boolean> {
  const { log, botClient, botStatus } = deps

  if (!botClient || botStatus !== 'running') {
    log.warn('Bot client not available for sending direct message')
    return false
  }

  try {
    let embed: DiscordEmbed

    if (notification.type === 'system') {
      embed = createSystemEmbed(
        notification.title,
        notification.embedFields,
        notification.safetyTriggered,
      )
    } else {
      embed = createMediaNotificationEmbed(notification)
    }

    const user = await botClient.users.fetch(discordId)
    if (!user) {
      log.warn({ discordId }, 'Could not find Discord user')
      return false
    }

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

    log.info(
      `Discord notification sent successfully to ${user.username} for "${notification.title}"`,
    )

    return true
  } catch (error) {
    log.error({ error, discordId }, 'Failed to send direct message')
    return false
  }
}
