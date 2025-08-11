import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  CreateTagBodySchema,
  CreateTagResponseSchema,
  ErrorSchema,
} from '@schemas/sonarr/create-tag.schema.js'
import { logRouteError } from '@utils/route-errors.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: z.infer<typeof CreateTagBodySchema>
    Reply: z.infer<typeof CreateTagResponseSchema>
  }>(
    '/create-tag',
    {
      schema: {
        summary: 'Create Sonarr tag',
        operationId: 'createSonarrTag',
        description: 'Create a new tag in a Sonarr instance',
        body: CreateTagBodySchema,
        response: {
          200: CreateTagResponseSchema,
          400: ErrorSchema,
          404: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Sonarr'],
      },
    },
    async (request, reply) => {
      try {
        const { instanceId, label } = request.body

        const instance =
          await fastify.sonarrManager.getSonarrInstance(instanceId)
        if (!instance) {
          return reply.notFound('Sonarr instance not found')
        }

        const service = fastify.sonarrManager.getSonarrService(instanceId)
        if (!service) {
          return reply.notFound('Sonarr service not initialized')
        }

        const newTag = await service.createTag(label)

        reply.status(200)
        return newTag
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }

        logRouteError(fastify.log, request, err, {
          message: 'Error creating tag',
          context: {
            service: 'sonarr',
            instanceId: request.body.instanceId,
            label: request.body.label,
          },
        })
        return reply.internalServerError('Unable to create tag')
      }
    },
  )
}

export default plugin
