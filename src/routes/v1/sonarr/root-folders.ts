import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  QuerystringSchema,
  RootFoldersResponseSchema,
  ErrorSchema,
} from '@schemas/sonarr/get-root-folders.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: z.infer<typeof QuerystringSchema>
    Reply: z.infer<typeof RootFoldersResponseSchema>
  }>(
    '/root-folders',
    {
      schema: {
        querystring: QuerystringSchema,
        response: {
          200: RootFoldersResponseSchema,
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

        const rootFolders = await service.fetchRootFolders()
        const response: z.infer<typeof RootFoldersResponseSchema> = {
          success: true,
          instance: {
            id: instance.id,
            name: instance.name,
            baseUrl: instance.baseUrl,
          },
          rootFolders,
        }

        reply.status(200)
        return response
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }

        fastify.log.error('Error fetching Sonarr root folders:', err)
        return reply.internalServerError('Unable to fetch Sonarr root folders')
      }
    },
  )
}

export default plugin
