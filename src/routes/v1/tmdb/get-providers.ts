import type { ErrorResponse } from '@schemas/common/error.schema.js'
import {
  ProvidersErrorSchema,
  type ProvidersResponse,
  ProvidersResponseSchema,
} from '@schemas/tmdb/get-providers.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsync } from 'fastify'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Reply: ProvidersResponse | ErrorResponse
  }>(
    '/providers',
    {
      schema: {
        summary: 'Get streaming providers',
        operationId: 'getTmdbProviders',
        description:
          'Fetch list of streaming service providers available for the configured region. Results are cached for 24 hours.',
        response: {
          200: ProvidersResponseSchema,
          500: ProvidersErrorSchema,
          503: ProvidersErrorSchema,
        },
        tags: ['TMDB'],
      },
    },
    async (request, reply) => {
      try {
        // Check if TMDB is configured
        if (!fastify.tmdb.isConfigured()) {
          return reply.serviceUnavailable(
            'TMDB API is not configured. Please add your TMDB API key to the settings.',
          )
        }

        // Use configured region
        const region = fastify.config.tmdbRegion || 'US'

        // Fetch available providers (uses cache if available)
        const providers = await fastify.tmdb.getAvailableProviders(region)

        if (!providers) {
          const response: ProvidersResponse = {
            success: true,
            message: `No providers available for region ${region}`,
            region,
            providers: [],
          }
          reply.status(200)
          return response
        }

        const response: ProvidersResponse = {
          success: true,
          message: `Providers retrieved successfully for region ${region}`,
          region,
          providers,
        }

        reply.status(200)
        return response
      } catch (err) {
        logRouteError(fastify.log, request, err, {
          message: 'Failed to fetch TMDB providers',
        })
        return reply.internalServerError('Failed to fetch providers')
      }
    },
  )
}

export default plugin
