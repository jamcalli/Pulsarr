import {
  ArrCreateTagBodySchema,
  ArrCreateTagResponseSchema,
} from '@schemas/common/arr-create-tag.schema.js'
import { ErrorSchema } from '@schemas/common/error.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.post(
    '/create-tag',
    {
      schema: {
        summary: 'Create Sonarr tag',
        operationId: 'createSonarrTag',
        description: 'Create a new tag in a Sonarr instance',
        body: ArrCreateTagBodySchema,
        response: {
          200: ArrCreateTagResponseSchema,
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
      } catch (error) {
        logRouteError(fastify.log, request, error, {
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
