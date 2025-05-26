import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  QuerystringSchema,
  QualityProfilesResponseSchema,
  ErrorSchema,
} from '@schemas/sonarr/get-quality-profiles.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: z.infer<typeof QuerystringSchema>
    Reply: z.infer<typeof QualityProfilesResponseSchema>
  }>(
    '/quality-profiles',
    {
      schema: {
        summary: 'Get Sonarr quality profiles',
        operationId: 'getSonarrQualityProfiles',
        description: 'Retrieve quality profiles from a Sonarr instance',
        querystring: QuerystringSchema,
        response: {
          200: QualityProfilesResponseSchema,
          400: ErrorSchema,
          404: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Sonarr'],
      },
    },
    async (request, reply) => {
      try {
        const instanceId = Number.parseInt(request.query.instanceId, 10)
        if (Number.isNaN(instanceId)) {
          return reply.badRequest('Invalid instance ID')
        }

        const instance =
          await fastify.sonarrManager.getSonarrInstance(instanceId)
        if (!instance) {
          return reply.notFound('Sonarr instance not found')
        }

        const service = fastify.sonarrManager.getSonarrService(instanceId)
        if (!service) {
          return reply.notFound('Sonarr service not initialized')
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

        fastify.log.error('Error fetching Sonarr quality profiles:', err)
        return reply.internalServerError(
          'Unable to fetch Sonarr quality profiles',
        )
      }
    },
  )
}

export default plugin
