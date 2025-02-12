import fp from 'fastify-plugin'
import { DiscordNotificationService } from '@services/discord-notifications.service.js'

export default fp(
  async (fastify) => {
    const discordService = new DiscordNotificationService(fastify.log, fastify)
    fastify.decorate('discord', discordService)
  },
  {
    name: 'discord-notification-service',
    dependencies: ['database'],
  },
)

declare module 'fastify' {
  interface FastifyInstance {
    discord: DiscordNotificationService
  }
}
