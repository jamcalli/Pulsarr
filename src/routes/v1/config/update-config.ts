import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import { 
  ConfigUpdateSchema,
  ConfigUpdateResponseSchema,
  ConfigUpdateErrorSchema 
} from '@schemas/config/update-config.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.put<{
    Body: z.infer<typeof ConfigUpdateSchema>
    Reply: z.infer<typeof ConfigUpdateResponseSchema>
  }>(
    '/config',
    {
      schema: {
        body: ConfigUpdateSchema,
        response: {
          200: ConfigUpdateResponseSchema,
          500: ConfigUpdateErrorSchema,
        },
        tags: ['Config'],
      },
    },
    async (request, reply) => {
      try {
        const configUpdate = request.body
        const updatedConfig = await fastify.updateConfig(configUpdate)
        
        reply.status(200)
        return {
          success: true,
          config: updatedConfig
        }
      } catch (error) {
        throw reply.internalServerError('Unable to update configuration')
      }
    },
  )
}

export default plugin