import {
  ErrorSchema,
  QuerystringSchema,
} from '@schemas/sonarr/get-quality-profiles.schema.js'
import { TagsResponseSchema } from '@schemas/sonarr/get-tags.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: z.infer<typeof QuerystringSchema>
    Reply: z.infer<typeof TagsResponseSchema>
  }>(
    '/tags',
    {
      schema: {
        summary: 'Get Sonarr tags',
        operationId: 'getSonarrTags',
        description: 'Retrieve tags from a Sonarr instance',
        querystring: QuerystringSchema,
        response: {
          200: TagsResponseSchema,
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
        logRouteError(fastify.log, request, err, {
          message: 'Error fetching tags',
          context: {
            instanceId: request.query.instanceId,
            service: 'sonarr',
          },
        })
        return reply.internalServerError('Unable to fetch Sonarr tags')
      }
    },
  )
}

export default plugin
