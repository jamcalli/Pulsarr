import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  CreateTagBodySchema,
  CreateTagResponseSchema,
  ErrorSchema,
} from '@schemas/sonarr/create-tag.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: z.infer<typeof CreateTagBodySchema>
    Reply: z.infer<typeof CreateTagResponseSchema>
  }>(
    '/create-tag',
    {
      schema: {
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
          throw reply.notFound('Sonarr instance not found')
        }

        const service = fastify.sonarrManager.getSonarrService(instanceId)
        if (!service) {
          throw reply.notFound('Sonarr service not initialized')
        }

        const newTag = await service.createTag(label)

        reply.status(200)
        return newTag
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }

        fastify.log.error('Error creating Sonarr tag:', err)
        throw reply.internalServerError('Unable to create tag')
      }
    },
  )
}

export default plugin
