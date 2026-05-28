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
 * Sends a pre-built embed as a direct message to a Discord user.
 *
 * @param discordId - The Discord user ID to message
 * @param embed - The embed to send
 * @param deps - Dependencies (bot client, logger)
 * @param components - Optional action-row components (e.g. buttons)
 * @returns true if the message was sent successfully
 */
export async function sendDirectMessageEmbed(
  discordId: string,
  embed: DiscordEmbed,
  deps: DiscordDmDeps,
  components?: ActionRowBuilder<ButtonBuilder>[],
): Promise<boolean> {
  const { log, botClient, botStatus } = deps

  if (!botClient || botStatus !== 'running') {
    log.warn('Bot client not available for sending direct message')
    return false
  }

  try {
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

    if (components) {
      messagePayload.components = components
    }

    await user.send(messagePayload)

    log.info(
      `Discord notification sent successfully to ${user.username} for "${embed.title ?? 'notification'}"`,
    )

    return true
  } catch (error) {
    log.error({ error, discordId }, 'Failed to send direct message')
    return false
  }
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
  let embed: DiscordEmbed
  let components: ActionRowBuilder<ButtonBuilder>[] | undefined

  if (notification.type === 'system') {
    embed = createSystemEmbed(
      notification.title,
      notification.embedFields,
      notification.safetyTriggered,
      notification.tmdbUrl,
    )

    if (notification.actionButton) {
      const button = new ButtonBuilder()
        .setCustomId(notification.actionButton.customId)
        .setLabel(notification.actionButton.label)
        .setStyle(ButtonStyle[notification.actionButton.style])

      components = [new ActionRowBuilder<ButtonBuilder>().addComponents(button)]
    }
  } else {
    embed = createMediaNotificationEmbed(notification)
  }

  return sendDirectMessageEmbed(discordId, embed, deps, components)
}
