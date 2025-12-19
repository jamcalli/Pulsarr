import {
  WEBHOOK_EVENT_TYPES,
  type WebhookEventType,
} from '@root/types/webhook-endpoint.types.js'
import {
  CreateWebhookEndpointSchema,
  TestWebhookEndpointSchema,
  UpdateWebhookEndpointSchema,
  WebhookDeleteResponseSchema,
  WebhookEndpointErrorSchema,
  WebhookEndpointParamsSchema,
  WebhookEndpointResponseSchema,
  WebhookEndpointsListResponseSchema,
  WebhookEventTypesResponseSchema,
  WebhookTestResponseSchema,
} from '@schemas/webhooks/webhook-endpoints.schema.js'
import { testWebhookEndpoint } from '@services/notifications/channels/native-webhook.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

/** Event type descriptions for UI display */
const EVENT_TYPE_DESCRIPTIONS: Record<WebhookEventType, string> = {
  'media.available': 'When content becomes available to watch',
  'watchlist.added': 'When a user adds content to their watchlist',
  'watchlist.removed': 'When a user removes content from their watchlist',
  'approval.created': 'When a new approval request is submitted',
  'approval.resolved': 'When an approval is approved or rejected',
  'approval.auto': 'When content is auto-approved',
  'delete_sync.completed': 'When a delete sync job completes',
  'user.created': 'When a new user is added',
}

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  // List all webhook endpoints
  fastify.get(
    '/webhooks/endpoints',
    {
      schema: {
        summary: 'List webhook endpoints',
        operationId: 'listWebhookEndpoints',
        description: 'Retrieve all configured webhook endpoints',
        response: {
          200: WebhookEndpointsListResponseSchema,
          500: WebhookEndpointErrorSchema,
        },
        tags: ['Webhooks'],
      },
    },
    async (request, reply) => {
      try {
        const endpoints = await fastify.db.getAllWebhookEndpoints()

        return {
          success: true as const,
          data: endpoints.map((e) => ({
            id: e.id,
            name: e.name,
            url: e.url,
            authHeaderName: e.auth_header_name,
            authHeaderValue: e.auth_header_value,
            eventTypes: e.event_types,
            enabled: e.enabled,
            createdAt: e.created_at,
            updatedAt: e.updated_at,
          })),
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to retrieve webhook endpoints',
        })
        return reply.internalServerError('Failed to retrieve webhook endpoints')
      }
    },
  )

  // Get single webhook endpoint
  fastify.get(
    '/webhooks/endpoints/:id',
    {
      schema: {
        summary: 'Get webhook endpoint',
        operationId: 'getWebhookEndpoint',
        description: 'Retrieve a single webhook endpoint by ID',
        params: WebhookEndpointParamsSchema,
        response: {
          200: WebhookEndpointResponseSchema,
          404: WebhookEndpointErrorSchema,
          500: WebhookEndpointErrorSchema,
        },
        tags: ['Webhooks'],
      },
    },
    async (request, reply) => {
      try {
        const endpoint = await fastify.db.getWebhookEndpointById(
          request.params.id,
        )

        if (!endpoint) {
          return reply.notFound('Webhook endpoint not found')
        }

        return {
          success: true as const,
          data: {
            id: endpoint.id,
            name: endpoint.name,
            url: endpoint.url,
            authHeaderName: endpoint.auth_header_name,
            authHeaderValue: endpoint.auth_header_value,
            eventTypes: endpoint.event_types,
            enabled: endpoint.enabled,
            createdAt: endpoint.created_at,
            updatedAt: endpoint.updated_at,
          },
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to retrieve webhook endpoint',
        })
        return reply.internalServerError('Failed to retrieve webhook endpoint')
      }
    },
  )

  // Create webhook endpoint
  fastify.post(
    '/webhooks/endpoints',
    {
      schema: {
        summary: 'Create webhook endpoint',
        operationId: 'createWebhookEndpoint',
        description: 'Create a new webhook endpoint',
        body: CreateWebhookEndpointSchema,
        response: {
          201: WebhookEndpointResponseSchema,
          400: WebhookEndpointErrorSchema,
          500: WebhookEndpointErrorSchema,
        },
        tags: ['Webhooks'],
      },
    },
    async (request, reply) => {
      try {
        const endpoint = await fastify.db.createWebhookEndpoint(request.body)

        reply.status(201)
        return {
          success: true as const,
          data: {
            id: endpoint.id,
            name: endpoint.name,
            url: endpoint.url,
            authHeaderName: endpoint.auth_header_name,
            authHeaderValue: endpoint.auth_header_value,
            eventTypes: endpoint.event_types,
            enabled: endpoint.enabled,
            createdAt: endpoint.created_at,
            updatedAt: endpoint.updated_at,
          },
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to create webhook endpoint',
        })
        return reply.internalServerError('Failed to create webhook endpoint')
      }
    },
  )

  // Update webhook endpoint
  fastify.put(
    '/webhooks/endpoints/:id',
    {
      schema: {
        summary: 'Update webhook endpoint',
        operationId: 'updateWebhookEndpoint',
        description: 'Update an existing webhook endpoint',
        params: WebhookEndpointParamsSchema,
        body: UpdateWebhookEndpointSchema,
        response: {
          200: WebhookEndpointResponseSchema,
          404: WebhookEndpointErrorSchema,
          500: WebhookEndpointErrorSchema,
        },
        tags: ['Webhooks'],
      },
    },
    async (request, reply) => {
      try {
        const endpoint = await fastify.db.updateWebhookEndpoint(
          request.params.id,
          request.body,
        )

        if (!endpoint) {
          return reply.notFound('Webhook endpoint not found')
        }

        return {
          success: true as const,
          data: {
            id: endpoint.id,
            name: endpoint.name,
            url: endpoint.url,
            authHeaderName: endpoint.auth_header_name,
            authHeaderValue: endpoint.auth_header_value,
            eventTypes: endpoint.event_types,
            enabled: endpoint.enabled,
            createdAt: endpoint.created_at,
            updatedAt: endpoint.updated_at,
          },
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to update webhook endpoint',
        })
        return reply.internalServerError('Failed to update webhook endpoint')
      }
    },
  )

  // Delete webhook endpoint
  fastify.delete(
    '/webhooks/endpoints/:id',
    {
      schema: {
        summary: 'Delete webhook endpoint',
        operationId: 'deleteWebhookEndpoint',
        description: 'Delete a webhook endpoint',
        params: WebhookEndpointParamsSchema,
        response: {
          200: WebhookDeleteResponseSchema,
          404: WebhookEndpointErrorSchema,
          500: WebhookEndpointErrorSchema,
        },
        tags: ['Webhooks'],
      },
    },
    async (request, reply) => {
      try {
        const deleted = await fastify.db.deleteWebhookEndpoint(
          request.params.id,
        )

        if (!deleted) {
          return reply.notFound('Webhook endpoint not found')
        }

        return {
          success: true,
          message: 'Webhook endpoint deleted successfully',
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to delete webhook endpoint',
        })
        return reply.internalServerError('Failed to delete webhook endpoint')
      }
    },
  )

  // Test webhook endpoint (before saving)
  fastify.post(
    '/webhooks/endpoints/test',
    {
      schema: {
        summary: 'Test webhook endpoint',
        operationId: 'testWebhookEndpoint',
        description:
          'Test a webhook endpoint by sending a test payload (use before saving)',
        body: TestWebhookEndpointSchema,
        response: {
          200: WebhookTestResponseSchema,
          500: WebhookEndpointErrorSchema,
        },
        tags: ['Webhooks'],
      },
    },
    async (request, reply) => {
      try {
        const result = await testWebhookEndpoint(
          request.body.url,
          request.body.authHeaderName,
          request.body.authHeaderValue,
          'Test Endpoint',
          fastify.log,
        )

        return {
          success: result.success,
          statusCode: result.statusCode,
          error: result.error,
          responseTime: result.responseTime,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to test webhook endpoint',
        })
        return reply.internalServerError('Failed to test webhook endpoint')
      }
    },
  )

  // Test existing webhook endpoint
  fastify.post(
    '/webhooks/endpoints/:id/test',
    {
      schema: {
        summary: 'Test existing webhook endpoint',
        operationId: 'testExistingWebhookEndpoint',
        description: 'Test an existing webhook endpoint by ID',
        params: WebhookEndpointParamsSchema,
        response: {
          200: WebhookTestResponseSchema,
          404: WebhookEndpointErrorSchema,
          500: WebhookEndpointErrorSchema,
        },
        tags: ['Webhooks'],
      },
    },
    async (request, reply) => {
      try {
        const endpoint = await fastify.db.getWebhookEndpointById(
          request.params.id,
        )

        if (!endpoint) {
          return reply.notFound('Webhook endpoint not found')
        }

        const result = await testWebhookEndpoint(
          endpoint.url,
          endpoint.auth_header_name ?? undefined,
          endpoint.auth_header_value ?? undefined,
          endpoint.name,
          fastify.log,
        )

        return {
          success: result.success,
          statusCode: result.statusCode,
          error: result.error,
          responseTime: result.responseTime,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to test webhook endpoint',
        })
        return reply.internalServerError('Failed to test webhook endpoint')
      }
    },
  )

  // List available event types
  fastify.get(
    '/webhooks/event-types',
    {
      schema: {
        summary: 'List webhook event types',
        operationId: 'listWebhookEventTypes',
        description: 'List all available webhook event types with descriptions',
        response: {
          200: WebhookEventTypesResponseSchema,
        },
        tags: ['Webhooks'],
      },
    },
    async () => {
      return {
        success: true as const,
        data: WEBHOOK_EVENT_TYPES.map((type) => ({
          type,
          description: EVENT_TYPE_DESCRIPTIONS[type],
        })),
      }
    },
  )
}

export default plugin
