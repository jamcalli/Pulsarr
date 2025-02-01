import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  InstancesResponseSchema,
  ErrorSchema,
} from '@schemas/sonarr/get-all-instances.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Reply: z.infer<typeof InstancesResponseSchema>
  }>(
    '/all-instances',
    {
      schema: {
        response: {
          200: InstancesResponseSchema,
          500: ErrorSchema,
        },
        tags: ['Sonarr'],
      },
    },
    async (request, reply) => {
      try {
        const instances = await fastify.sonarrManager.getAllInstances()
        
        const response: z.infer<typeof InstancesResponseSchema> = {
          success: true,
          instances,
        }

        return response
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }

        fastify.log.error('Error fetching Sonarr instances:', err)
        throw reply.internalServerError('Unable to fetch Sonarr instances')
      }
    },
  )
}

export default plugin