import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { DiscordNotificationService } from '@services/discord-notifications.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    discord: DiscordNotificationService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const discord = new DiscordNotificationService(fastify.log, fastify)

    // Original configuration check
    const requiredBotConfig = [
      'discordBotToken',
      'discordClientId',
      'discordGuildId',
    ] as const
    const hasBotConfig = requiredBotConfig.every((key) =>
      Boolean(fastify.config[key]),
    )

    // Create wrapped versions of the startBot and stopBot methods
    // that will emit status events after state changes
    const originalStartBot = discord.startBot
    discord.startBot = async function (...args) {
      const result = await originalStartBot.apply(this, args)
      emitDiscordStatus(fastify)
      return result
    }

    const originalStopBot = discord.stopBot
    discord.stopBot = async function (...args) {
      const result = await originalStopBot.apply(this, args)
      emitDiscordStatus(fastify)
      return result
    }

    emitDiscordStatus(fastify)

    const statusInterval = setInterval(() => {
      if (fastify.progress.hasActiveConnections()) {
        emitDiscordStatus(fastify)
      }
    }, 1000) // 1 second

    fastify.addHook('onClose', () => {
      clearInterval(statusInterval)
    })

    if (hasBotConfig) {
      fastify.log.info('Discord bot configuration found, attempting auto-start')
      const started = await discord.startBot()
      if (started) {
        fastify.log.info('Discord bot started automatically')
      } else {
        fastify.log.warn('Failed to auto-start Discord bot')
      }
    } else {
      fastify.log.info(
        'Discord bot configuration incomplete, bot features will require manual initialization',
      )
    }

    fastify.decorate('discord', discord)

    fastify.addHook('onClose', async () => {
      if (discord.getBotStatus() === 'running') {
        fastify.log.info('Stopping Discord bot during shutdown')
        await discord.stopBot()
      }
    })
  },
  {
    name: 'discord-notification-service',
    dependencies: ['database', 'progress'],
  },
)

function emitDiscordStatus(fastify: FastifyInstance) {
  if (!fastify.progress.hasActiveConnections()) {
    return
  }

  const status = fastify.discord.getBotStatus()
  const operationId = `discord-status-${Date.now()}`

  fastify.progress.emit({
    operationId,
    type: 'system', 
    phase: 'info',
    progress: 100,
    message: `Discord bot status: ${status}`,
  })
}
