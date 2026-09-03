import {
  GetTmdbMetadataByGuidParamsSchema,
  GetTmdbMetadataParamsSchema,
  GetTmdbMetadataQuerySchema,
  TmdbMetadataErrorResponseSchema,
  TmdbMetadataSuccessResponseSchema,
  TmdbRegionsErrorResponseSchema,
  TmdbRegionsSuccessResponseSchema,
} from '@schemas/tmdb/tmdb.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const NOT_CONFIGURED =
  'TMDB API is not configured. Please add your TMDB API key to the settings.'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  // Intelligent TMDB metadata endpoint - accepts GUID format (tmdb:123 or tvdb:456)
  fastify.get(
    '/metadata/:id',
    {
      schema: {
        summary: 'Get TMDB metadata by GUID',
        operationId: 'getTmdbMetadataByGuid',
        description:
          'Accepts GUID format IDs (tmdb:123, tvdb:456) and resolves to fetch TMDB metadata',
        params: GetTmdbMetadataByGuidParamsSchema,
        querystring: GetTmdbMetadataQuerySchema,
        response: {
          200: TmdbMetadataSuccessResponseSchema,
          400: TmdbMetadataErrorResponseSchema,
          404: TmdbMetadataErrorResponseSchema,
          500: TmdbMetadataErrorResponseSchema,
          503: TmdbMetadataErrorResponseSchema,
        },
        tags: ['TMDB'],
      },
    },
    async (request, reply) => {
      try {
        if (!fastify.tmdb.isConfigured()) {
          return reply.serviceUnavailable(NOT_CONFIGURED)
        }

        const result = await fastify.tmdb.getMetadataByGuid(
          request.params.id,
          request.query.type,
          request.query.region,
        )

        if (!result) {
          return reply.notFound(`No metadata found for ${request.params.id}`)
        }

        return {
          success: true,
          message:
            result.kind === 'movie'
              ? 'Movie metadata retrieved successfully'
              : 'TV show metadata retrieved successfully',
          metadata: result.metadata,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to fetch TMDB metadata',
          guid: request.params.id,
        })
        return reply.internalServerError('Failed to fetch metadata')
      }
    },
  )

  // Get movie metadata by TMDB ID
  fastify.get(
    '/movie/:id',
    {
      schema: {
        summary: 'Get movie metadata from TMDB',
        operationId: 'getTmdbMovieMetadata',
        description:
          'Fetch TMDB movie metadata including overview, ratings, and watch providers',
        params: GetTmdbMetadataParamsSchema,
        querystring: GetTmdbMetadataQuerySchema,
        response: {
          200: TmdbMetadataSuccessResponseSchema,
          400: TmdbMetadataErrorResponseSchema,
          404: TmdbMetadataErrorResponseSchema,
          500: TmdbMetadataErrorResponseSchema,
          503: TmdbMetadataErrorResponseSchema,
        },
        tags: ['TMDB'],
      },
    },
    async (request, reply) => {
      try {
        if (!fastify.tmdb.isConfigured()) {
          return reply.serviceUnavailable(NOT_CONFIGURED)
        }

        const metadata = await fastify.tmdb.getMovieMetadata(
          request.params.id,
          request.query.region,
        )

        if (!metadata) {
          return reply.notFound(
            `No movie metadata found for TMDB ID ${request.params.id}`,
          )
        }

        return {
          success: true,
          message: 'Movie metadata retrieved successfully',
          metadata,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to fetch TMDB movie metadata',
          tmdbId: request.params.id,
        })
        return reply.internalServerError('Failed to fetch movie metadata')
      }
    },
  )

  // Get TV show metadata by TMDB ID
  fastify.get(
    '/tv/:id',
    {
      schema: {
        summary: 'Get TV show metadata from TMDB',
        operationId: 'getTmdbTvMetadata',
        description:
          'Fetch TMDB TV show metadata including overview, ratings, and watch providers',
        params: GetTmdbMetadataParamsSchema,
        querystring: GetTmdbMetadataQuerySchema,
        response: {
          200: TmdbMetadataSuccessResponseSchema,
          400: TmdbMetadataErrorResponseSchema,
          404: TmdbMetadataErrorResponseSchema,
          500: TmdbMetadataErrorResponseSchema,
          503: TmdbMetadataErrorResponseSchema,
        },
        tags: ['TMDB'],
      },
    },
    async (request, reply) => {
      try {
        if (!fastify.tmdb.isConfigured()) {
          return reply.serviceUnavailable(NOT_CONFIGURED)
        }

        const metadata = await fastify.tmdb.getTvMetadata(
          request.params.id,
          request.query.region,
        )

        if (!metadata) {
          return reply.notFound(
            `No TV show metadata found for TMDB ID ${request.params.id}`,
          )
        }

        return {
          success: true,
          message: 'TV show metadata retrieved successfully',
          metadata,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to fetch TMDB TV metadata',
          tmdbId: request.params.id,
        })
        return reply.internalServerError('Failed to fetch TV show metadata')
      }
    },
  )

  // Get available TMDB regions
  fastify.get(
    '/regions',
    {
      schema: {
        summary: 'Get available TMDB regions',
        operationId: 'getTmdbRegions',
        description:
          'Fetch list of regions/countries that have watch provider data available in TMDB',
        response: {
          200: TmdbRegionsSuccessResponseSchema,
          500: TmdbRegionsErrorResponseSchema,
          503: TmdbRegionsErrorResponseSchema,
        },
        tags: ['TMDB'],
      },
    },
    async (request, reply) => {
      try {
        if (!fastify.tmdb.isConfigured()) {
          return reply.serviceUnavailable(NOT_CONFIGURED)
        }

        const regions = await fastify.tmdb.getAvailableRegions()

        if (!regions) {
          return {
            success: true,
            message: 'No regions available',
            regions: [],
          }
        }

        return {
          success: true,
          message: 'Regions retrieved successfully',
          regions,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to fetch TMDB regions',
        })
        return reply.internalServerError('Failed to fetch regions')
      }
    },
  )
}

export default plugin
