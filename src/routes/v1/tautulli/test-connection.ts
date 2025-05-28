import type { FastifyPluginAsync } from 'fastify'
import {
  TestConnectionBodySchema,
  TestConnectionResponseSchema,
  ErrorSchema,
  type TestConnectionBody,
  type TestConnectionResponse,
} from '@root/schemas/tautulli/tautulli.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: TestConnectionBody
    Reply: TestConnectionResponse
  }>(
    '/test-connection',
    {
      schema: {
        summary: 'Test Tautulli connection with provided credentials',
        operationId: 'testTautulliConnectionWithCredentials',
        description:
          'Test the connection to Tautulli using provided URL and API key. Requires Plex Pass.',
        body: TestConnectionBodySchema,
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
        const config = await fastify.db.getConfig(1)
        if (!config?.selfRss || !config?.friendsRss) {
          return reply.badRequest(
            'Plex Pass is required for Tautulli integration. Please generate RSS feeds first to verify Plex Pass subscription.',
          )
        }

        const { tautulliUrl, tautulliApiKey } = request.body

        // Test connection by making an API call to the arnold endpoint
        const url = new URL(`${tautulliUrl}/api/v2`)
        const searchParams = new URLSearchParams({
          apikey: tautulliApiKey,
          cmd: 'arnold',
        })
        url.search = searchParams.toString()

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        })

        if (!response.ok) {
          return {
            success: false,
            message: `HTTP ${response.status}: ${response.statusText}`,
          }
        }

        const data = (await response.json()) as {
          response?: {
            result?: string
            message?: string
          }
        }

        if (data?.response?.result === 'success') {
          return {
            success: true,
            message: 'Successfully connected to Tautulli',
          }
        }

        return {
          success: false,
          message: data?.response?.message || 'Connection test failed',
        }
      } catch (error) {
        fastify.log.error(error, 'Failed to test Tautulli connection')

        let errorMessage = 'Connection test failed'
        if (error instanceof Error) {
          errorMessage = error.message
        }

        return reply.status(500).send({
          success: false,
          message: errorMessage,
        })
      }
    },
  )
}

export default plugin
