import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  CreateTagBodySchema,
  CreateTagResponseSchema,
  ErrorSchema,
} from '@schemas/radarr/create-tag.schema.js'

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
        tags: ['Radarr'],
      },
    },
    async (request, reply) => {
      try {
        const { instanceId, label } = request.body

        const instance =
          await fastify.radarrManager.getRadarrInstance(instanceId)
        if (!instance) {
          throw reply.notFound('Radarr instance not found')
        }

        const service = fastify.radarrManager.getRadarrService(instanceId)
        if (!service) {
          throw reply.notFound('Radarr service not initialized')
        }

        // Create the tag using the service
        const newTag = await service.createTag(label)

        reply.status(200)
        return newTag
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }

        fastify.log.error('Error creating Radarr tag:', err)
        throw reply.internalServerError('Unable to create tag')
      }
    },
  )
}

export default plugin
