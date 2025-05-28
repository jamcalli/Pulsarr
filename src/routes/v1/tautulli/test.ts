import type { FastifyPluginAsync } from 'fastify'
import {
  TestConnectionResponseSchema,
  ErrorSchema,
  type TestConnectionResponse,
} from '@root/schemas/tautulli/tautulli.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Reply: TestConnectionResponse
  }>(
    '/test',
    {
      schema: {
        summary: 'Test Tautulli connection',
        operationId: 'testTautulliConnection',
        description:
          'Test the connection to Tautulli using the current configuration. Requires Plex Pass.',
        response: {
          200: TestConnectionResponseSchema,
          400: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Tautulli'],
      },
    },
    async (_, reply) => {
      try {
        // Check if user has Plex Pass by verifying RSS feeds exist
        const config = await fastify.db.getConfig(1)
        if (!config?.selfRss || !config?.friendsRss) {
          return reply.badRequest(
            'Plex Pass is required for Tautulli integration. Please generate RSS feeds first to verify Plex Pass subscription.',
          )
        }

        // Test by calling arnold endpoint (Tautulli's test endpoint)
        const isConnected = await fastify.tautulli.testConnection()

        if (isConnected) {
          return {
            success: true,
            message: 'Successfully connected to Tautulli',
          }
        }
        return {
          success: false,
          message: 'Failed to connect to Tautulli',
        }
      } catch (error) {
        fastify.log.error(error, 'Failed to test Tautulli connection')
        return reply.status(500).send({
          success: false,
          message: 'Connection test failed',
        })
      }
    },
  )
}

export default plugin
