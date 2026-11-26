import { WebhookQueueService } from '@services/webhook-queue.service.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    webhookQueue: WebhookQueueService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const config = {
      retryInterval: fastify.config.pendingWebhookRetryInterval,
      maxAge: fastify.config.pendingWebhookMaxAge,
      cleanupInterval: fastify.config.pendingWebhookCleanupInterval,
    }

    const service = new WebhookQueueService(fastify.log, fastify, config)
    fastify.decorate('webhookQueue', service)

    fastify.addHook('onReady', async () => {
      try {
        await service.initialize()
        fastify.log.debug('WebhookQueueService initialized successfully')
      } catch (error) {
        fastify.log.error({ error }, 'Failed to initialize WebhookQueueService')
        throw error
      }
    })

    fastify.addHook('onClose', () => {
      service.shutdown()
    })
  },
  {
    name: 'webhook-queue',
    dependencies: [
      'caches',
      'config',
      'database',
      'notifications',
      'plex-label-sync',
      'scheduler',
      'sonarr-manager',
    ],
  },
)
