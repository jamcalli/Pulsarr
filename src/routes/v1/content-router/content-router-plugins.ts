import {
  ContentRouterPluginsResponseSchema,
  ContentRouterRuleErrorSchema,
} from '@schemas/content-router/content-router.schema.js'
import {
  EvaluatorMetadataErrorSchema,
  EvaluatorMetadataResponseSchema,
  type FieldInfo,
  type OperatorInfo,
} from '@schemas/content-router/evaluator-metadata.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

interface EvaluatorMetadataWithContentType {
  name: string
  description: string
  priority: number
  supportedFields?: FieldInfo[]
  supportedOperators?: Record<string, OperatorInfo[]>
  contentType?: 'radarr' | 'sonarr' | 'both'
}

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
        const metadata =
          fastify.contentRouter.getEvaluatorsMetadata() as EvaluatorMetadataWithContentType[]

        const normalizedMetadata = metadata.map((evaluator) => ({
          name: evaluator.name,
          description: evaluator.description,
          priority: evaluator.priority,
          supportedFields: evaluator.supportedFields || [],
          supportedOperators: evaluator.supportedOperators || {},
          contentType: evaluator.contentType || 'both',
        }))

        return {
          success: true,
          evaluators: normalizedMetadata,
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
