import {
  ErrorSchema,
  QuerystringSchema,
  RootFoldersResponseSchema,
} from '@schemas/radarr/get-root-folders.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'
import type { z } from 'zod'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.get(
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
        const { instanceId } = request.query

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
