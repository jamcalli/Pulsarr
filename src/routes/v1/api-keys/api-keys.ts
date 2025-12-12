import {
  ApiKeyErrorSchema,
  CreateApiKeyResponseSchema,
  CreateApiKeySchema,
  GetApiKeysResponseSchema,
  RevokeApiKeyParamsSchema,
} from '@schemas/api-keys/api-keys.schema.js'
import { NoContentSchema } from '@schemas/common/error.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  // Create API Key
  fastify.post(
    '/api-keys',
    {
      schema: {
        summary: 'Create API key',
        operationId: 'createApiKey',
        description: 'Create a new API key for authentication',
        body: CreateApiKeySchema,
        response: {
          201: CreateApiKeyResponseSchema,
          400: ApiKeyErrorSchema,
          500: ApiKeyErrorSchema,
        },
        tags: ['API Keys'],
      },
    },
    async (request, reply) => {
      try {
        const apiKey = await fastify.apiKeys.createApiKey(request.body)

        reply.status(201)
        return {
          success: true,
          message: 'API key created successfully',
          apiKey: {
            id: apiKey.id,
            name: apiKey.name,
            key: apiKey.key,
            user_id: apiKey.user_id,
            created_at: apiKey.created_at,
            is_active: apiKey.is_active,
          },
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to create API key',
        })
        return reply.internalServerError('Failed to create API key')
      }
    },
  )

  // Get API Keys
  fastify.get(
    '/api-keys',
    {
      schema: {
        summary: 'Get API keys',
        operationId: 'getApiKeys',
        description: 'Retrieve all active API keys',
        response: {
          200: GetApiKeysResponseSchema,
          500: ApiKeyErrorSchema,
        },
        tags: ['API Keys'],
      },
    },
    async (request, reply) => {
      try {
        const apiKeys = await fastify.apiKeys.getApiKeys()

        return {
          success: true,
          message: 'API keys retrieved successfully',
          apiKeys: apiKeys.map((key) => ({
            id: key.id,
            name: key.name,
            key: key.key,
            user_id: key.user_id,
            created_at: key.created_at,
            is_active: key.is_active,
          })),
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to retrieve API keys',
        })
        return reply.internalServerError('Failed to retrieve API keys')
      }
    },
  )

  // Revoke API Key
  fastify.delete(
    '/api-keys/:id',
    {
      schema: {
        summary: 'Revoke API key',
        operationId: 'revokeApiKey',
        description: 'Revoke an API key by ID',
        params: RevokeApiKeyParamsSchema,
        response: {
          204: NoContentSchema,
          404: ApiKeyErrorSchema,
          500: ApiKeyErrorSchema,
        },
        tags: ['API Keys'],
      },
    },
    async (request, reply) => {
      try {
        const result = await fastify.apiKeys.revokeApiKey(request.params.id)

        if (!result) {
          return reply.notFound('API key not found')
        }

        reply.status(204)
        return
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to revoke API key',
        })
        return reply.internalServerError('Failed to revoke API key')
      }
    },
  )
}

export default plugin
