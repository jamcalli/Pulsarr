import {
  ContentRouterPluginsResponseSchema,
  ContentRouterRuleErrorSchema,
} from '@schemas/content-router/content-router.schema.js'
import {
  EvaluatorMetadataErrorSchema,
  EvaluatorMetadataResponseSchema,
} from '@schemas/content-router/evaluator-metadata.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  // Get router plugin information
  fastify.get(
    '/plugins',
    {
      schema: {
        summary: 'Get router plugins',
        operationId: 'getRouterPlugins',
        description:
          'Retrieve information about available content router evaluator plugins',
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
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to retrieve router plugins',
        })
        return reply.internalServerError('Unable to retrieve router plugins')
      }
    },
  )

  fastify.get(
    '/plugins/metadata',
    {
      schema: {
        summary: 'Get plugin metadata',
        operationId: 'getPluginMetadata',
        description:
          'Retrieve detailed metadata about content router evaluator plugins including supported fields and operators',
        response: {
          200: EvaluatorMetadataResponseSchema,
          500: EvaluatorMetadataErrorSchema,
        },
        tags: ['Content Router'],
      },
    },
    async (request, reply) => {
      try {
        return {
          success: true,
          evaluators: fastify.contentRouter.getEvaluatorsMetadata(),
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to retrieve evaluator metadata',
        })
        return reply.internalServerError(
          'Unable to retrieve evaluator metadata',
        )
      }
    },
  )
}

export default plugin
