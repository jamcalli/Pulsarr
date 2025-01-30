import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  QualityProfilesResponseSchema,
  QualityProfilesErrorSchema,
} from '@schemas/sonarr/get-quality-profiles.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Reply: z.infer<typeof QualityProfilesResponseSchema>
  }>(
    '/quality-profiles',
    {
      schema: {
        response: {
          200: QualityProfilesResponseSchema,
          500: QualityProfilesErrorSchema,
        },
        tags: ['Sonarr'],
      },
    },
    async (request, reply) => {
      try {
        const qualityProfiles = await fastify.sonarr.fetchQualityProfiles()

        const response: z.infer<typeof QualityProfilesResponseSchema> = {
          success: true,
          qualityProfiles,
        }

        reply.status(200)
        return response
      } catch (error) {
        fastify.log.error('Error fetching Sonarr quality profiles:', error)
        throw reply.internalServerError(
          'Unable to fetch Sonarr quality profiles',
        )
      }
    },
  )
}

export default plugin
