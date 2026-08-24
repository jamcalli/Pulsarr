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
import type { OpenAPIV3_1 } from 'openapi-types'
import { createSchema, type oas31 } from 'zod-openapi'

const OPENAPI_VERSION = '3.1.0'

/** Builds the OpenAPI webhooks section from the payload registry. */
function buildWebhooksSpec(): NonNullable<OpenAPIV3_1.Document['webhooks']> {
  const webhooks: Record<string, oas31.PathItemObject> = {}

  for (const eventType of WEBHOOK_EVENT_TYPES) {
    const entry = WEBHOOK_PAYLOAD_REGISTRY[eventType]
    const { schema: jsonSchema } = createSchema(entry.schema, {
      openapiVersion: OPENAPI_VERSION,
    })

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

  // zod-openapi's oas31 types and openapi-types declare the same 3.1 document
  // shape incompatibly; bridge once at the boundary
  return webhooks as NonNullable<OpenAPIV3_1.Document['webhooks']>
}

const sortKeys = <T>(obj: Record<string, T>): Record<string, T> =>
  Object.fromEntries(
    Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  )

const HTTP_METHODS = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
  'trace',
] as const

// satisfies, not an annotation: openapi-types intersects 3.0 and 3.1 shapes
// in operations, and only the narrow $ref literal is assignable to both
const RATE_LIMITED_RESPONSE = {
  description: 'Rate limit exceeded',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/Error' },
    },
  },
} satisfies OpenAPIV3_1.ResponseObject

// Every operation can return 429: unmatched routes share the global bucket
// and route-level overrides (login, webhook with a bad secret) emit their own
function addRateLimitResponses(paths: OpenAPIV3_1.PathsObject): void {
  for (const pathItem of Object.values(paths)) {
    if (!pathItem) continue

    for (const method of HTTP_METHODS) {
      const responses = pathItem[method]?.responses
      if (responses) {
        responses['429'] ??= structuredClone(RATE_LIMITED_RESPONSE)
      }
    }
  }
}

// The transform can hand back a 2.0 or 3.x document; everything past this
// guard relies on the 3.1 shape declared in the plugin config
function isOpenApi31Document(
  doc: ReturnType<typeof fastifyZodOpenApiTransformObject>,
): doc is Partial<OpenAPIV3_1.Document> {
  return 'openapi' in doc && doc.openapi?.startsWith('3.1') === true
}

const createOpenapiConfig = (fastify: FastifyInstance, pathSuffix: string) => {
  const urlObject = new URL(fastify.config.baseUrl)

  fastify.log.debug(
    { baseUrl: fastify.config.baseUrl, origin: urlObject.origin },
    'Configuring Swagger',
  )

  return {
    openapi: {
      openapi: OPENAPI_VERSION,
      webhooks: buildWebhooksSpec(),
      info: {
        title: 'Pulsarr API',
        description:
          'API documentation for Pulsarr - a Plex watchlist integration for Sonarr and Radarr',
        version: 'V1',
      },
      servers: [
        {
          url: `{protocol}://{host}:{port}${pathSuffix}`,
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
          url: `${fastify.config.baseUrl}${pathSuffix}`,
          description: 'Primary Server',
        },
        {
          url: `${urlObject.protocol}//${urlObject.hostname}:${fastify.config.port}${pathSuffix}`,
          description: 'Direct Server Access (with port)',
        },
        {
          url: `http://localhost:${fastify.config.port}${pathSuffix}`,
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
          name: 'Watchlist Exclusions',
          description: 'Watchlist exclusion management endpoints',
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
          maintainerrWebhookAuth: {
            type: 'apiKey' as const,
            in: 'header' as const,
            name: 'Authorization',
            description:
              'Webhook authentication using auto-generated secret in the Authorization header. Maintainerr webhooks are configured with this header automatically.',
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
      const spec = fastifyZodOpenApiTransformObject(args)
      if (!isOpenApi31Document(spec)) {
        return spec
      }

      // Route autoload follows filesystem enumeration order, which varies
      // across machines - sort so spec generation is deterministic
      if (spec.paths) {
        addRateLimitResponses(spec.paths)
        spec.paths = sortKeys(spec.paths)
      }
      if (spec.components?.schemas) {
        spec.components.schemas = sortKeys(spec.components.schemas)
      }

      return spec
    },
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const basePath = normalizeBasePath(fastify.config.basePath)
    const pathSuffix = basePath === '/' ? '' : basePath

    // Register the zod-openapi plugin (required for schema transformation)
    await fastify.register(fastifyZodOpenApiPlugin)

    /**
     * Register Swagger with combined config
     * @see {@link https://github.com/fastify/fastify-swagger}
     */
    await fastify.register(
      fastifySwagger,
      createOpenapiConfig(fastify, pathSuffix),
    )

    /**
     * Register Swagger UI
     * routePrefix must include basePath because this plugin is fp()-wrapped,
     * which registers on the root scope (bypassing the Fastify prefix).
     * @see {@link https://github.com/fastify/fastify-swagger-ui}
     */
    const swaggerRoute =
      basePath === '/' ? '/api/docs' : (`${basePath}/api/docs` as `/${string}`)
    await fastify.register(apiReference, {
      routePrefix: swaggerRoute,
    })
  },
  {
    dependencies: ['config'],
  },
)
