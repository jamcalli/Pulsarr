import fastifySwagger from '@fastify/swagger'
import {
  EVENT_TYPE_LABELS,
  WEBHOOK_EVENT_TYPES,
} from '@root/types/webhook-endpoint.types.js'
import apiReference from '@scalar/fastify-api-reference'
import { WEBHOOK_PAYLOAD_REGISTRY } from '@schemas/webhooks/webhook-payloads.schema.js'
import { normalizeBasePath } from '@utils/url.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import {
  fastifyZodOpenApiPlugin,
  fastifyZodOpenApiTransform,
  fastifyZodOpenApiTransformObject,
} from 'fastify-zod-openapi'
import { createSchema } from 'zod-openapi'

/**
 * Builds the OpenAPI webhooks section from the payload registry.
 * Converts Zod schemas to OpenAPI schemas and includes examples.
 */
function buildWebhooksSpec(): Record<string, unknown> {
  const webhooks: Record<string, unknown> = {}

  for (const eventType of WEBHOOK_EVENT_TYPES) {
    const entry = WEBHOOK_PAYLOAD_REGISTRY[eventType]
    const { schema: jsonSchema } = createSchema(entry.schema)

    webhooks[eventType] = {
      post: {
        tags: ['Webhook Payloads'],
        summary: EVENT_TYPE_LABELS[eventType] ?? eventType,
        description: entry.description,
        operationId: `webhook${eventType
          .split(/[._]/)
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
          .join('')}`,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: jsonSchema,
              example: entry.example,
            },
          },
        },
        responses: {
          '200': {
            description: 'Webhook received successfully',
          },
        },
      },
    }
  }

  return webhooks
}

const createOpenapiConfig = (fastify: FastifyInstance) => {
  const urlObject = new URL(fastify.config.baseUrl)

  fastify.log.debug(
    { baseUrl: fastify.config.baseUrl, origin: urlObject.origin },
    'Configuring Swagger',
  )

  return {
    openapi: {
      info: {
        title: 'Pulsarr API',
        description:
          'API documentation for Pulsarr - a Plex watchlist integration for Sonarr and Radarr',
        version: 'V1',
      },
      servers: [
        {
          url: '{protocol}://{host}:{port}',
          description: 'Custom Server',
          variables: {
            protocol: {
              enum: ['http', 'https'],
              default: 'http',
              description: 'The protocol used to communicate with the server',
            },
            host: {
              default: 'localhost',
              description: 'The hostname or IP address of the Pulsarr server',
            },
            port: {
              default: fastify.config.port.toString(),
              description: 'The port on which Pulsarr is running',
            },
          },
        },
        {
          url: fastify.config.baseUrl,
          description: 'Primary Server',
        },
        {
          url: `${urlObject.protocol}//${urlObject.hostname}:${fastify.config.port}`,
          description: 'Direct Server Access (with port)',
        },
        {
          url: `http://localhost:${fastify.config.port}`,
          description: 'Localhost Access (with port)',
        },
      ],
      tags: [
        {
          name: 'API Keys',
          description: 'API key management endpoints',
        },
        {
          name: 'Approval',
          description: 'Content approval system endpoints',
        },
        {
          name: 'Authentication',
          description: 'Authentication and authorization endpoints',
        },
        {
          name: 'Config',
          description: 'Configuration management endpoints',
        },
        {
          name: 'Content Router',
          description: 'Content routing and rule management endpoints',
        },
        {
          name: 'Labels',
          description: 'Plex label synchronization and management endpoints',
        },
        {
          name: 'Logs',
          description: 'Log streaming and monitoring endpoints',
        },
        {
          name: 'Metadata',
          description: 'Metadata refresh and management endpoints',
        },
        {
          name: 'Notifications',
          description: 'Notification system endpoints',
        },
        {
          name: 'Plex',
          description: 'Plex server integration endpoints',
        },
        {
          name: 'Progress',
          description: 'Operation progress tracking endpoints',
        },
        {
          name: 'Quota',
          description: 'User quota management endpoints',
        },
        {
          name: 'Radarr',
          description: 'Radarr integration endpoints',
        },
        {
          name: 'Scheduler',
          description: 'Job scheduling and management endpoints',
        },
        {
          name: 'Session Monitoring',
          description:
            'Plex session monitoring and rolling show management endpoints',
        },
        {
          name: 'Sonarr',
          description: 'Sonarr integration endpoints',
        },
        {
          name: 'Statistics',
          description: 'Analytics and statistics endpoints',
        },
        {
          name: 'Sync',
          description: 'Synchronization control endpoints',
        },
        {
          name: 'System',
          description: 'System health and monitoring endpoints',
        },
        {
          name: 'Tags',
          description: 'Tag management endpoints',
        },
        {
          name: 'TMDB',
          description: 'The Movie Database (TMDB) integration endpoints',
        },
        {
          name: 'Users',
          description: 'User management endpoints',
        },
        {
          name: 'Watchlist Workflow',
          description: 'Watchlist processing workflow endpoints',
        },
        {
          name: 'Webhooks',
          description: 'Native webhook endpoint management',
        },
        {
          name: 'Webhook Payloads',
          description:
            'Outgoing webhook payload schemas sent to configured endpoints',
        },
      ],
      components: {
        securitySchemes: {
          apiKeyAuth: {
            type: 'apiKey' as const,
            in: 'header' as const,
            name: 'X-API-Key',
            description: 'API key authentication using X-API-Key header',
          },
          sessionAuth: {
            type: 'apiKey' as const,
            in: 'cookie' as const,
            name: fastify.config.cookieName,
            description: 'Session-based authentication using cookies',
          },
          webhookSecretAuth: {
            type: 'apiKey' as const,
            in: 'header' as const,
            name: 'X-Pulsarr-Secret',
            description:
              'Webhook authentication using auto-generated secret. Sonarr/Radarr webhooks are configured with this header automatically.',
          },
        },
      },
      security: [
        { apiKeyAuth: [] as string[] },
        { sessionAuth: [] as string[] },
      ] as Array<Record<string, string[]>>,
    },
    hideUntagged: true,
    exposeRoute: true,
    transform: fastifyZodOpenApiTransform,
    transformObject: (
      args: Parameters<typeof fastifyZodOpenApiTransformObject>[0],
    ) => {
      // Run the default transform first
      const result = fastifyZodOpenApiTransformObject(args)

      // Inject webhooks section into the OpenAPI spec
      // We're using OpenAPI mode so result will have OpenAPI structure
      ;(result as Record<string, unknown>).webhooks = buildWebhooksSpec()

      return result
    },
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    // Register the zod-openapi plugin (required for schema transformation)
    await fastify.register(fastifyZodOpenApiPlugin)

    /**
     * Register Swagger with combined config
     * @see {@link https://github.com/fastify/fastify-swagger}
     */
    await fastify.register(fastifySwagger, createOpenapiConfig(fastify))

    /**
     * Register Swagger UI
     * @see {@link https://github.com/fastify/fastify-swagger-ui}
     */
    const normalizedBasePath = normalizeBasePath(fastify.config.basePath)
    const swaggerRoute =
      normalizedBasePath === '/'
        ? '/api/docs'
        : (`${normalizedBasePath}/api/docs` as `/${string}`)
    await fastify.register(apiReference, {
      routePrefix: swaggerRoute,
    })
  },
  {
    dependencies: ['config'],
  },
)
