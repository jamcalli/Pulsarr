import {
  ConfigConflictSchema,
  ConfigErrorSchema,
  ConfigResponseSchema,
  ConfigUpdateSchema,
} from '@root/schemas/config/config.schema.js'
import type { ConfigUpdateResult } from '@root/types/config.types.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyReply } from 'fastify'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

function replyUpdateFailure(
  reply: FastifyReply,
  result: Extract<ConfigUpdateResult, { success: false }>,
): FastifyReply {
  switch (result.reason) {
    case 'plex_pass_required':
      return reply.badRequest(result.message)
    case 'tag_prefix_blocked':
    case 'token_rejected':
      return reply.conflict(result.message)
    case 'token_unreachable':
      return reply.badGateway(result.message)
    case 'webhook_unreachable':
      return reply.code(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: result.message,
        webhooks: result.webhooks,
      })
  }
}

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.get(
    '',
    {
      schema: {
        summary: 'Get configuration',
        operationId: 'getConfig',
        description: 'Retrieve the current application configuration settings',
        response: {
          200: ConfigResponseSchema,
          400: ConfigErrorSchema,
          404: ConfigErrorSchema,
          500: ConfigErrorSchema,
        },
        tags: ['Config'],
      },
    },
    async (request, reply) => {
      try {
        const config = await fastify.configService.get()
        if (!config) {
          return reply.notFound('Config not found in database')
        }

        reply.status(200)
        return { success: true as const, config }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to fetch configuration',
        })
        return reply.internalServerError('Unable to fetch configuration')
      }
    },
  )

  fastify.put(
    '',
    {
      schema: {
        summary: 'Update configuration',
        operationId: 'updateConfig',
        description: 'Update the application configuration settings',
        body: ConfigUpdateSchema,
        response: {
          200: ConfigResponseSchema,
          400: ConfigErrorSchema,
          404: ConfigErrorSchema,
          409: ConfigConflictSchema,
          500: ConfigErrorSchema,
          502: ConfigErrorSchema,
        },
        tags: ['Config'],
      },
    },
    async (request, reply) => {
      try {
        const result = await fastify.configService.update(request.body)
        if (!result.success) {
          return replyUpdateFailure(reply, result)
        }

        reply.status(200)
        return {
          success: true as const,
          config: result.config,
          webhooks: result.webhooks,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to update configuration',
        })
        return reply.internalServerError('Unable to update configuration')
      }
    },
  )
}

export default plugin
