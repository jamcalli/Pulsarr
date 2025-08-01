import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  GetTmdbMetadataParamsSchema,
  GetTmdbMetadataQuerySchema,
  TmdbMetadataSuccessResponseSchema,
  TmdbMetadataErrorResponseSchema,
  TmdbRegionsSuccessResponseSchema,
  TmdbRegionsErrorResponseSchema,
  type GetTmdbMetadataParams,
  type GetTmdbMetadataQuery,
  type TmdbMetadataSuccessResponse,
  type TmdbMetadataErrorResponse,
  type TmdbMovieMetadata,
  type TmdbTvMetadata,
} from '@schemas/tmdb/tmdb.schema.js'
import { extractTmdbId, extractTvdbId } from '@root/utils/guid-handler.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  // Intelligent TMDB metadata endpoint - accepts GUID format (tmdb:123 or tvdb:456)
  fastify.get<{
    Params: { id: string }
    Querystring: GetTmdbMetadataQuery
    Reply: TmdbMetadataSuccessResponse | TmdbMetadataErrorResponse
  }>(
    '/metadata/:id',
    {
      schema: {
        summary: 'Get TMDB metadata by GUID',
        operationId: 'getTmdbMetadataByGuid',
        description:
          'Accepts GUID format IDs (tmdb:123, tvdb:456) and resolves to fetch TMDB metadata',
        params: z.object({
          id: z
            .string()
            .min(1, 'GUID is required (format: tmdb:123 or tvdb:456)'),
        }),
        querystring: GetTmdbMetadataQuerySchema,
        response: {
          200: TmdbMetadataSuccessResponseSchema,
          404: TmdbMetadataErrorResponseSchema,
          503: TmdbMetadataErrorResponseSchema,
        },
        tags: ['TMDB'],
      },
    },
    async (request, reply) => {
      try {
        const inputGuid = request.params.id
        const region = request.query.region

        // Check if TMDB is configured
        if (!fastify.tmdb.isConfigured()) {
          return reply.code(503).send({
            success: false,
            message:
              'TMDB API is not configured. Please add your TMDB API key to the settings.',
          })
        }

        // Check if it's already a TMDB GUID
        const directTmdbId = extractTmdbId([inputGuid])
        if (directTmdbId > 0) {
          // Try movie first, then TV
          try {
            const movieMetadata = await fastify.tmdb.getMovieMetadata(
              directTmdbId,
              region,
            )
            if (movieMetadata) {
              return {
                success: true,
                message: 'Movie metadata retrieved successfully',
                metadata: movieMetadata,
              }
            }
          } catch (error) {
            // Movie failed, try TV
            fastify.log.warn(
              `Movie metadata fetch failed for TMDB ID ${directTmdbId}:`,
              error,
            )
          }

          try {
            const tvMetadata = await fastify.tmdb.getTvMetadata(
              directTmdbId,
              region,
            )
            if (tvMetadata) {
              return {
                success: true,
                message: 'TV show metadata retrieved successfully',
                metadata: tvMetadata,
              }
            }
          } catch (error) {
            // Both failed
            fastify.log.warn(
              `TV metadata fetch failed for TMDB ID ${directTmdbId}:`,
              error,
            )
          }

          return reply.code(404).send({
            success: false,
            message: `No metadata found for TMDB ID ${directTmdbId}`,
          })
        }

        // Check if it's a TVDB GUID
        const tvdbId = extractTvdbId([inputGuid])
        if (tvdbId > 0) {
          // Use TMDB's find endpoint to get the correct TMDB ID and type
          const findResult = await fastify.tmdb.findByTvdbId(tvdbId)

          if (!findResult) {
            return reply.code(404).send({
              success: false,
              message: `No TMDB content found for TVDB ID ${tvdbId}`,
            })
          }

          // Fetch metadata based on the determined type
          let metadata: TmdbMovieMetadata | TmdbTvMetadata | null
          if (findResult.type === 'movie') {
            metadata = await fastify.tmdb.getMovieMetadata(
              findResult.tmdbId,
              region,
            )
            if (!metadata) {
              return reply.code(404).send({
                success: false,
                message: `No movie metadata found for TMDB ID ${findResult.tmdbId}`,
              })
            }
          } else {
            metadata = await fastify.tmdb.getTvMetadata(
              findResult.tmdbId,
              region,
            )
            if (!metadata) {
              return reply.code(404).send({
                success: false,
                message: `No TV show metadata found for TMDB ID ${findResult.tmdbId}`,
              })
            }
          }

          return {
            success: true,
            message: `${findResult.type === 'movie' ? 'Movie' : 'TV show'} metadata retrieved successfully`,
            metadata,
          }
        }

        // If it's neither TMDB nor TVDB format, return error
        return reply.code(400).send({
          success: false,
          message: `Invalid GUID format: ${inputGuid}. Expected format: tmdb:123 or tvdb:456`,
        })
      } catch (error) {
        fastify.log.error(
          `Error fetching TMDB metadata for GUID ${request.params.id}:`,
          error,
        )
        return reply.code(500).send({
          success: false,
          message: 'Failed to fetch metadata',
        })
      }
    },
  )

  // Get movie metadata by TMDB ID
  fastify.get<{
    Params: GetTmdbMetadataParams
    Querystring: GetTmdbMetadataQuery
    Reply: TmdbMetadataSuccessResponse | TmdbMetadataErrorResponse
  }>(
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
          404: TmdbMetadataErrorResponseSchema,
          503: TmdbMetadataErrorResponseSchema,
        },
        tags: ['TMDB'],
      },
    },
    async (request, reply) => {
      try {
        const tmdbId = Number.parseInt(request.params.id, 10)
        const region = request.query.region

        // Validate TMDB ID
        if (Number.isNaN(tmdbId) || tmdbId <= 0) {
          return reply.code(400).send({
            success: false,
            message: 'Invalid TMDB ID provided',
          })
        }

        // Check if TMDB is configured
        if (!fastify.tmdb.isConfigured()) {
          return reply.code(503).send({
            success: false,
            message:
              'TMDB API is not configured. Please add your TMDB API key to the settings.',
          })
        }

        // Fetch movie metadata
        const metadata = await fastify.tmdb.getMovieMetadata(tmdbId, region)

        if (!metadata) {
          return reply.code(404).send({
            success: false,
            message: `No movie metadata found for TMDB ID ${tmdbId}`,
          })
        }

        return {
          success: true,
          message: 'Movie metadata retrieved successfully',
          metadata,
        }
      } catch (error) {
        fastify.log.error(
          `Error fetching TMDB movie metadata for ID ${request.params.id}:`,
          error,
        )
        return reply.code(500).send({
          success: false,
          message: 'Failed to fetch movie metadata',
        })
      }
    },
  )

  // Get TV show metadata by TMDB ID
  fastify.get<{
    Params: GetTmdbMetadataParams
    Querystring: GetTmdbMetadataQuery
    Reply: TmdbMetadataSuccessResponse | TmdbMetadataErrorResponse
  }>(
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
          404: TmdbMetadataErrorResponseSchema,
          503: TmdbMetadataErrorResponseSchema,
        },
        tags: ['TMDB'],
      },
    },
    async (request, reply) => {
      try {
        const tmdbId = Number.parseInt(request.params.id, 10)
        const region = request.query.region

        // Validate TMDB ID
        if (Number.isNaN(tmdbId) || tmdbId <= 0) {
          return reply.code(400).send({
            success: false,
            message: 'Invalid TMDB ID provided',
          })
        }

        // Check if TMDB is configured
        if (!fastify.tmdb.isConfigured()) {
          return reply.code(503).send({
            success: false,
            message:
              'TMDB API is not configured. Please add your TMDB API key to the settings.',
          })
        }

        // Fetch TV show metadata
        const metadata = await fastify.tmdb.getTvMetadata(tmdbId, region)

        if (!metadata) {
          return reply.code(404).send({
            success: false,
            message: `No TV show metadata found for TMDB ID ${tmdbId}`,
          })
        }

        return {
          success: true,
          message: 'TV show metadata retrieved successfully',
          metadata,
        }
      } catch (error) {
        fastify.log.error(
          `Error fetching TMDB TV metadata for ID ${request.params.id}:`,
          error,
        )
        return reply.code(500).send({
          success: false,
          message: 'Failed to fetch TV show metadata',
        })
      }
    },
  )

  // Get available TMDB regions for watch providers
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
          503: TmdbRegionsErrorResponseSchema,
        },
        tags: ['TMDB'],
      },
    },
    async (request, reply) => {
      try {
        // Check if TMDB is configured
        if (!fastify.tmdb.isConfigured()) {
          return reply.code(503).send({
            success: false,
            message:
              'TMDB API is not configured. Please add your TMDB API key to the settings.',
          })
        }

        // Fetch available regions
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
        fastify.log.error('Error fetching TMDB regions:', error)
        return reply.code(500).send({
          success: false,
          message: 'Failed to fetch regions',
        })
      }
    },
  )
}

export default plugin
