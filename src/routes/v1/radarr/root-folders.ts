import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  QuerystringSchema,
  RootFoldersResponseSchema,
  ErrorSchema,
} from '@schemas/radarr/get-root-folders.schema.js'
import { logRouteError } from '@utils/route-errors.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: z.infer<typeof QuerystringSchema>
    Reply: z.infer<typeof RootFoldersResponseSchema>
  }>(
    '/root-folders',
    {
      schema: {
        summary: 'Get Radarr root folders',
        operationId: 'getRadarrRootFolders',
        description: 'Retrieve root folders from a Radarr instance',
        querystring: QuerystringSchema,
        response: {
          200: RootFoldersResponseSchema,
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

        logRouteError(fastify.log, request, err, {
          message: 'Error fetching root folders',
          context: {
            instanceId: request.query.instanceId,
            service: 'radarr',
          },
        })
        return reply.internalServerError('Unable to fetch Radarr root folders')
      }
    },
  )
}

export default plugin
