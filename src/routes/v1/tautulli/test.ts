import {
  ErrorSchema,
  type TestConnectionResponse,
  TestConnectionResponseSchema,
} from '@root/schemas/tautulli/tautulli.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsync } from 'fastify'

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
    async (request, reply) => {
      try {
        // Check if user has Plex Pass by verifying RSS feeds exist
        const config = fastify.config
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
        // Preserve framework-provided HTTP errors
        if (error instanceof Error && 'statusCode' in error) {
          throw error
        }

        logRouteError(fastify.log, request, error, {
          message: 'Failed to test Tautulli connection',
          context: { service: 'tautulli', action: 'testConnection' },
        })
        return reply.internalServerError('Connection test failed')
      }
    },
  )
}

export default plugin
