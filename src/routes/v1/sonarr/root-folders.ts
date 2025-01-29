import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  RootFoldersResponseSchema,
  RootFoldersErrorSchema,
} from '@schemas/sonarr/get-root-folders.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Reply: z.infer<typeof RootFoldersResponseSchema>
  }>(
    '/root-folders',
    {
      schema: {
        response: {
          200: RootFoldersResponseSchema,
          500: RootFoldersErrorSchema,
        },
        tags: ['Sonarr'],
      },
    },
    async (request, reply) => {
      try {
        const rootFolders = await fastify.sonarr.fetchRootFolders()

        const response: z.infer<typeof RootFoldersResponseSchema> = {
          success: true,
          rootFolders,
        }

        reply.status(200)
        return response
      } catch (error) {
        fastify.log.error('Error fetching Sonarr root folders:', error)
        throw reply.internalServerError('Unable to fetch Sonarr root folders')
      }
    },
  )
}

export default plugin