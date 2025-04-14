import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  ContentRouterPluginsResponseSchema,
  ContentRouterRuleErrorSchema,
} from '@schemas/content-router/content-router.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  // Get router plugin information
  fastify.get<{
    Reply: z.infer<typeof ContentRouterPluginsResponseSchema>
  }>(
    '/plugins',
    {
      schema: {
        response: {
          200: ContentRouterPluginsResponseSchema,
          500: ContentRouterRuleErrorSchema,
        },
        tags: ['Content Router'],
      },
    },
    async (request, reply) => {
      try {
        const plugins = fastify.contentRouter.getLoadedEvaluators()

        return {
          success: true,
          plugins,
        }
      } catch (err) {
        fastify.log.error('Error retrieving router plugins:', err)
        throw reply.internalServerError('Unable to retrieve router plugins')
      }
    },
  )
}

export default plugin
