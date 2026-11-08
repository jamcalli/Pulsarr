import {
  EvaluatorMetadataErrorSchema,
  EvaluatorMetadataResponseSchema,
} from '@schemas/content-router/evaluator-metadata.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
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
