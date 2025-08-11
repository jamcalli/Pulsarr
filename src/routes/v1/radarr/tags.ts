import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  QuerystringSchema,
  ErrorSchema,
} from '@schemas/radarr/get-quality-profiles.schema.js'
import { TagsResponseSchema } from '@schemas/radarr/get-tags.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: z.infer<typeof QuerystringSchema>
    Reply: z.infer<typeof TagsResponseSchema>
  }>(
    '/tags',
    {
      schema: {
        summary: 'Get Radarr tags',
        operationId: 'getRadarrTags',
        description: 'Retrieve tags from a Radarr instance',
        querystring: QuerystringSchema,
        response: {
          200: TagsResponseSchema,
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

        const tags = await service.getTags()
        const response: z.infer<typeof TagsResponseSchema> = {
          success: true,
          instance: {
            id: instance.id,
            name: instance.name,
            baseUrl: instance.baseUrl,
          },
          tags,
        }

        reply.status(200)
        return response
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }
        fastify.log.error({ error: err }, 'Error fetching Radarr tags:')
        return reply.internalServerError('Unable to fetch Radarr tags')
      }
    },
  )
}

export default plugin
