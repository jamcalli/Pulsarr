/**
 * Notification Service Plugin
 *
 * Registers the unified notification service.
 * Replaces discord-notifications, apprise-notifications, and plex-mobile plugins.
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

    fastify.decorate('notifications', notifications)

    fastify.progress.registerSnapshotProvider('notifications', () =>
      notifications.statusEvents(),
    )

    // Initialize on ready
    fastify.addHook('onReady', async () => {
      await notifications.initialize()

      // Subscribe to SSE content-scanned events for near-instant mobile retry
      fastify.plexServerService.onContentScanned(() => {
        notifications.plexMobile.triggerRetryProcessing()
      })

      // On SSE disconnect, start retry polling so queued items still get processed
      fastify.plexServerService.onSSE('disconnected', () => {
        notifications.plexMobile.startRetryPolling()
      })
    })

    // Cleanup on close
    fastify.addHook('onClose', async () => {
      await notifications.shutdown()
    })
  },
  {
    name: 'notification-service',
    dependencies: ['config', 'database', 'progress', 'plex-server'],
  },
)
