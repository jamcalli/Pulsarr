import { WebhookQueueService } from '@services/webhook-queue/index.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    webhookQueue: WebhookQueueService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const service = new WebhookQueueService(fastify.log, fastify)
    fastify.decorate('webhookQueue', service)

    fastify.addHook('onClose', async () => {
      service.shutdown()
    })
  },
  {
    name: 'webhook-queue',
    dependencies: [
      'database',
      'scheduler',
      'notification-service',
      'sonarr-manager',
    ],
  },
)
