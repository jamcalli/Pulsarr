import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  QuerystringSchema,
  QualityProfilesResponseSchema,
  ErrorSchema,
} from '@schemas/radarr/get-quality-profiles.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: z.infer<typeof QuerystringSchema>
    Reply: z.infer<typeof QualityProfilesResponseSchema>
  }>(
    '/quality-profiles',
    {
      schema: {
        summary: 'Get Radarr quality profiles',
        operationId: 'getRadarrQualityProfiles',
        description: 'Retrieve quality profiles from a Radarr instance',
        querystring: QuerystringSchema,
        response: {
          200: QualityProfilesResponseSchema,
          400: ErrorSchema,
          404: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Radarr'],
      },
    },
    async (request, reply) => {
      try {
        const instanceId = Number.parseInt(request.query.instanceId, 10)
        if (Number.isNaN(instanceId)) {
          return reply.badRequest('Invalid instance ID')
        }

        const instance =
          await fastify.radarrManager.getRadarrInstance(instanceId)
        if (!instance) {
          return reply.notFound('Radarr instance not found')
        }

        const service = fastify.radarrManager.getRadarrService(instanceId)
        if (!service) {
          return reply.notFound('Radarr service not initialized')
        }

        const qualityProfiles = await service.fetchQualityProfiles()
        const response: z.infer<typeof QualityProfilesResponseSchema> = {
          success: true,
          instance: {
            id: instance.id,
            name: instance.name,
            baseUrl: instance.baseUrl,
          },
          qualityProfiles,
        }

        reply.status(200)
        return response
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }
        fastify.log.error('Error fetching Radarr quality profiles:', err)
        return reply.internalServerError(
          'Unable to fetch Radarr quality profiles',
        )
      }
    },
  )
}

export default plugin
