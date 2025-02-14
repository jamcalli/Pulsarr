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

    const requiredBotConfig = [
      'discordBotToken',
      'discordClientId',
      'discordGuildId',
    ] as const

    const hasBotConfig = requiredBotConfig.every((key) =>
      Boolean(fastify.config[key]),
    )

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
    dependencies: ['database'],
  },
)
