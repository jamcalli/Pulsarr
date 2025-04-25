import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  ContentRouterPluginsResponseSchema,
  ContentRouterRuleErrorSchema,
} from '@schemas/content-router/content-router.schema.js'
import {
  EvaluatorMetadataResponseSchema,
  EvaluatorMetadataErrorSchema,
} from '@schemas/content-router/evaluator-metadata.schema.js'

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
          plugins: plugins || [],
        }
      } catch (err) {
        fastify.log.error('Error retrieving router plugins:', err)
        throw reply.internalServerError('Unable to retrieve router rules')
      }
    },
  )

  /**
   * GET /v1/content-router/plugins/metadata
   *
   * Returns detailed metadata about all evaluators loaded in the content router,
   * including supported fields and operators for each evaluator.
   * This information can be used to build dynamic UI elements for
   * creating and editing router rules.
   */
  fastify.get<{
    Reply: z.infer<typeof EvaluatorMetadataResponseSchema>
  }>(
    '/plugins/metadata',
    {
      schema: {
        response: {
          200: EvaluatorMetadataResponseSchema,
          500: EvaluatorMetadataErrorSchema,
        },
        tags: ['Content Router'],
      },
    },
    async (request, reply) => {
      try {
        const metadata = fastify.contentRouter.getEvaluatorsMetadata()

        // Normalize the data to match the schema
        const normalizedMetadata = metadata.map((evaluator) => ({
          name: evaluator.name,
          description: evaluator.description,
          priority: evaluator.priority,
          supportedFields: evaluator.supportedFields || [],
          supportedOperators: evaluator.supportedOperators || {},
        }))

        return {
          success: true,
          evaluators: normalizedMetadata,
        }
      } catch (error) {
        fastify.log.error('Error retrieving evaluator metadata:', error)
        throw reply.internalServerError('Unable to retrieve evaluator metadata')
      }
    },
  )
}

export default plugin
