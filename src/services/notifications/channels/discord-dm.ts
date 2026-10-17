import type { DirectMessage } from '@root/types/discord.types.js'
import type {
  DeliveryResult,
  DiscordBotStatus,
  NotificationTestOutcome,
} from '@root/types/notification.types.js'
import { errorMessage } from '@utils/error-message.js'
import { type Client, DiscordAPIError } from 'discord.js'
import type { FastifyBaseLogger } from 'fastify'
import { createTestEmbed } from '../templates/discord-embeds.js'

export interface DiscordDmDeps {
  logger: FastifyBaseLogger
  botClient: Client | null
  botStatus: DiscordBotStatus
}

function dmFailureReason(error: unknown): string {
  return error instanceof DiscordAPIError
    ? `${error.code} ${error.message}`
    : errorMessage(error)
}

export async function sendNotification(
  discordId: string,
  message: DirectMessage,
  deps: DiscordDmDeps,
): Promise<DeliveryResult> {
  const { logger, botClient, botStatus } = deps

  if (!botClient || botStatus !== 'running') {
    return { ok: false, reason: 'bot not running' }
  }

  const { embed, components } = message

  try {
    const user = await botClient.users.fetch(discordId)
    await user.send({
      content: `Hey ${user}! 👋`,
      embeds: [embed],
      ...(components ? { components } : {}),
    })

    logger.debug(
      `Discord DM sent to ${user.username} for "${embed.title ?? 'notification'}"`,
    )
    return { ok: true, handle: user.username }
  } catch (error) {
    const reason = dmFailureReason(error)
    logger.debug({ discordId, reason }, 'Failed to send direct message')
    return { ok: false, reason }
  }
}

export async function testNotification(
  discordId: string,
  deps: DiscordDmDeps,
): Promise<NotificationTestOutcome> {
  if (deps.botStatus === 'starting') {
    return {
      success: false,
      error: 'The Discord bot is still starting. Try again in a moment.',
    }
  }
  if (!deps.botClient || deps.botStatus !== 'running') {
    return {
      success: false,
      error:
        'The Discord bot is not running. Start it to send direct messages.',
    }
  }

  const result = await sendNotification(
    discordId,
    { embed: createTestEmbed() },
    deps,
  )
  return result.ok
    ? { success: true }
    : {
        success: false,
        error:
          'Discord refused the direct message. Check the Discord ID, that the user shares a server with the bot, and that they allow direct messages.',
      }
}
