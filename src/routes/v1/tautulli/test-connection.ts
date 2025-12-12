import {
  ErrorSchema,
  TestConnectionBodySchema,
  TestConnectionResponseSchema,
} from '@root/schemas/tautulli/tautulli.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.post(
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
          504: ErrorSchema,
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

        const { tautulliUrl, tautulliApiKey } = request.body

        // Validate URL protocol to prevent SSRF attacks
        const baseUrl = new URL(tautulliUrl)
        if (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') {
          return reply.badRequest(
            'Invalid Tautulli URL protocol (must be http or https)',
          )
        }

        // Test connection by making an API call to the arnold endpoint
        const url = new URL('/api/v2', baseUrl)
        const searchParams = new URLSearchParams({
          apikey: tautulliApiKey,
          cmd: 'arnold',
        })
        url.search = searchParams.toString()

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 10_000)
        const response = await fetch(url.toString(), {
          method: 'GET',
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
          },
        }).finally(() => clearTimeout(timeout))

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
        // Preserve framework-provided HTTP errors
        if (error instanceof Error && 'statusCode' in error) {
          throw error
        }

        // Handle timeout/abort errors
        if (error instanceof Error && error.name === 'AbortError') {
          return reply.gatewayTimeout(
            'Request to Tautulli timed out after 10 seconds',
          )
        }

        logRouteError(fastify.log, request, error, {
          message: 'Failed to test Tautulli connection',
        })

        let errorMessage = 'Connection test failed'
        if (error instanceof Error) {
          errorMessage = error.message
        }

        return reply.internalServerError(errorMessage)
      }
    },
  )
}

export default plugin
