/**
 * Notification Service Plugin
 *
 * Registers the unified notification service.
 * Replaces discord-notifications, apprise-notifications, and tautulli plugins.
 */

import { NotificationService } from '@services/notification.service.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    notifications: NotificationService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const notifications = new NotificationService(fastify.log, fastify)

    // Wrap startBot/stopBot to emit status after state changes
    const originalStartBot = notifications.discordBot.startBot.bind(
      notifications.discordBot,
    )
    notifications.discordBot.startBot = async (...args) => {
      try {
        const result = await originalStartBot(...args)
        return result
      } finally {
        emitDiscordStatus(fastify, notifications)
      }
    }

    const originalStopBot = notifications.discordBot.stopBot.bind(
      notifications.discordBot,
    )
    notifications.discordBot.stopBot = async (...args) => {
      try {
        const result = await originalStopBot(...args)
        return result
      } finally {
        emitDiscordStatus(fastify, notifications)
      }
    }

    fastify.decorate('notifications', notifications)
    emitDiscordStatus(fastify, notifications)
    emitTautulliStatus(fastify, notifications)
    emitAppriseStatus(fastify, notifications)

    // Status polling for UI updates
    const statusInterval = setInterval(() => {
      if (fastify.progress.hasActiveConnections()) {
        emitDiscordStatus(fastify, notifications)
        emitTautulliStatus(fastify, notifications)
        emitAppriseStatus(fastify, notifications)
      }
    }, 1000)

    fastify.addHook('onClose', () => {
      clearInterval(statusInterval)
    })

    // Initialize on ready
    fastify.addHook('onReady', async () => {
      await notifications.initialize()
    })

    // Shutdown on close
    fastify.addHook('onClose', async () => {
      await notifications.shutdown()
    })
  },
  {
    name: 'notification-service',
    dependencies: ['config', 'database', 'progress'],
  },
)

function emitDiscordStatus(
  fastify: FastifyInstance,
  notifications: NotificationService,
) {
  if (!fastify.progress.hasActiveConnections()) {
    return
  }

  const status = notifications.getBotStatus()
  const operationId = `discord-status-${Date.now()}`

  fastify.progress.emit({
    operationId,
    type: 'system',
    phase: 'info',
    progress: 100,
    message: `Discord bot status: ${status}`,
  })
}

function emitTautulliStatus(
  fastify: FastifyInstance,
  notifications: NotificationService,
) {
  if (!fastify.progress.hasActiveConnections()) {
    return
  }

  const status = notifications.tautulli.getStatus()
  const operationId = `tautulli-status-${Date.now()}`

  fastify.progress.emit({
    operationId,
    type: 'system',
    phase: 'info',
    progress: 100,
    message: `Tautulli status: ${status}`,
  })
}

function emitAppriseStatus(
  fastify: FastifyInstance,
  notifications: NotificationService,
) {
  if (!fastify.progress.hasActiveConnections()) {
    return
  }

  const status = notifications.apprise.getStatus()
  const operationId = `apprise-status-${Date.now()}`

  fastify.progress.emit({
    operationId,
    type: 'system',
    phase: 'info',
    progress: 100,
    message: `Apprise status: ${status}`,
  })
}
