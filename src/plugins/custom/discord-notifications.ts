import { DiscordNotificationService } from '@services/discord-notifications.service.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

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
      try {
        const result = await originalStartBot.apply(this, args)
        return result
      } finally {
        emitDiscordStatus(fastify)
      }
    }

    const originalStopBot = discord.stopBot
    discord.stopBot = async function (...args) {
      try {
        const result = await originalStopBot.apply(this, args)
        return result
      } finally {
        emitDiscordStatus(fastify)
      }
    }

    fastify.decorate('discord', discord)
    emitDiscordStatus(fastify)

    const statusInterval = setInterval(() => {
      if (fastify.progress.hasActiveConnections()) {
        emitDiscordStatus(fastify)
      }
    }, 1000) // 1 second

    fastify.addHook('onClose', () => {
      clearInterval(statusInterval)
    })

    // Move bot auto-start to onReady hook
    fastify.addHook('onReady', async () => {
      if (hasBotConfig) {
        fastify.log.info(
          'Discord bot configuration found, attempting auto-start',
        )
        try {
          const started = await discord.startBot()
          if (!started) {
            fastify.log.warn('Failed to auto-start Discord bot')
          }
          // Success is already logged by the service layer
        } catch (error) {
          fastify.log.error({ error }, 'Error during Discord bot auto-start')
          // Don't throw - let server continue without Discord bot
        }
      } else {
        fastify.log.debug(
          'Discord bot configuration incomplete, bot features will require manual initialization',
        )
      }
    })

    fastify.addHook('onClose', async () => {
      if (discord.getBotStatus() === 'running') {
        fastify.log.info('Stopping Discord bot during shutdown')
        await discord.stopBot()
      }
    })
  },
  {
    name: 'discord-notification-service',
    dependencies: ['config', 'database', 'progress'],
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
