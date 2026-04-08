import {
  ErrorSchema,
  QuerystringSchema,
  RootFoldersResponseSchema,
} from '@schemas/sonarr/get-root-folders.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.get(
    '/root-folders',
    {
      schema: {
        summary: 'Get Sonarr root folders',
        operationId: 'getSonarrRootFolders',
        description: 'Retrieve root folders from a Sonarr instance',
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
        const { instanceId } = request.query

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

        reply.status(200)
        return {
          success: true,
          instance: {
            id: instance.id,
            name: instance.name,
            baseUrl: instance.baseUrl,
          },
          rootFolders,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Error fetching root folders',
          context: {
            service: 'sonarr',
            instanceId: request.query.instanceId,
          },
        })
        return reply.internalServerError('Unable to fetch Sonarr root folders')
      }
    },
  )
}

export default plugin
