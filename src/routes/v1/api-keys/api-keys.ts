import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  CreateApiKeySchema,
  CreateApiKeyResponseSchema,
  GetApiKeysResponseSchema,
  RevokeApiKeyParamsSchema,
  RevokeApiKeyResponseSchema,
  ApiKeyErrorSchema,
} from '@schemas/api-keys/api-keys.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  // Create API Key
  fastify.post<{
    Body: z.infer<typeof CreateApiKeySchema>
    Reply:
      | z.infer<typeof CreateApiKeyResponseSchema>
      | z.infer<typeof ApiKeyErrorSchema>
  }>(
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
            created_at: apiKey.created_at,
          },
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('validation')) {
          reply.status(400)
          return {
            success: false,
            message: error.message,
          }
        }
        fastify.log.error({ error }, 'Failed to create API key')
        reply.status(500)
        return {
          success: false,
          message: 'Failed to create API key',
        }
      }
    },
  )

  // Get API Keys
  fastify.get<{
    Reply:
      | z.infer<typeof GetApiKeysResponseSchema>
      | z.infer<typeof ApiKeyErrorSchema>
  }>(
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
            created_at: key.created_at,
          })),
        }
      } catch (error) {
        fastify.log.error({ error }, 'Failed to get API keys')
        reply.status(500)
        return {
          success: false,
          message: 'Failed to retrieve API keys',
        }
      }
    },
  )

  // Revoke API Key
  fastify.delete<{
    Params: z.infer<typeof RevokeApiKeyParamsSchema>
  }>(
    '/api-keys/:id',
    {
      schema: {
        summary: 'Revoke API key',
        operationId: 'revokeApiKey',
        description: 'Revoke an API key by ID',
        params: RevokeApiKeyParamsSchema,
        response: {
          204: z.void(),
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
          reply.status(404)
          return {
            success: false,
            message: 'API key not found',
          }
        }

        reply.status(204)
      } catch (error) {
        fastify.log.error({ error }, 'Failed to revoke API key')
        reply.status(500)
        return {
          success: false,
          message: 'Failed to revoke API key',
        }
      }
    },
  )
}

export default plugin
