import {
  PlexServerErrorSchema,
  PlexServerResponseSchema,
  PlexTokenSchema,
} from '@schemas/plex/discover-servers.schema.js'
import {
  type ConnectionCandidate,
  testConnectionReachability,
} from '@services/plex-server/existence-check/index.js'
import { logRouteError } from '@utils/route-errors.js'
import {
  PLEX_CLIENT_IDENTIFIER,
  PLEX_PRODUCT_NAME,
  USER_AGENT,
} from '@utils/version.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

interface PlexResourceConnection {
  uri: string
  address: string
  port: number
  protocol?: string
  local: boolean
}

interface PlexResource {
  name: string
  owned: boolean
  provides: string[] | string
  connections: PlexResourceConnection[]
}

class PlexApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
    this.name = 'PlexApiError'
  }
}

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.post(
    '/discover-servers',
    {
      schema: {
        summary: 'Discover Plex servers',
        operationId: 'discoverPlexServers',
        description: 'Discover available Plex servers using a user token',
        body: PlexTokenSchema,
        response: {
          200: PlexServerResponseSchema,
          400: PlexServerErrorSchema,
          401: PlexServerErrorSchema,
          403: PlexServerErrorSchema,
          404: PlexServerErrorSchema,
          500: PlexServerErrorSchema,
          504: PlexServerErrorSchema,
        },
        tags: ['Plex'],
      },
    },
    async (request, reply) => {
      try {
        const { plexToken } = request.body

        fastify.log.info('Discovering Plex servers using provided token')

        const url = new URL('https://plex.tv/api/v2/resources')
        url.searchParams.append('includeHttps', '1')
        url.searchParams.append('includeRelay', '0')
        url.searchParams.append('includeIPv6', '0')

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 10_000)
        const response = await fetch(url.toString(), {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'application/json',
            'X-Plex-Token': plexToken,
            'X-Plex-Client-Identifier': PLEX_CLIENT_IDENTIFIER,
            'X-Plex-Product': PLEX_PRODUCT_NAME,
            'X-Plex-Platform': 'Web',
          },
        }).finally(() => clearTimeout(timeout))

        if (!response.ok) {
          throw new PlexApiError(
            `Failed to fetch Plex servers: ${response.statusText}`,
            response.status,
          )
        }

        const resources = (await response.json()) as PlexResource[]

        const serverOptions = []

        const serverResources = resources.filter(
          (r) =>
            r.provides &&
            (Array.isArray(r.provides)
              ? r.provides.includes('server')
              : r.provides.split(',').includes('server')) &&
            r.owned,
        )

        const candidates: ConnectionCandidate[] = serverResources.flatMap(
          (server) =>
            (server.connections || [])
              .filter((c) => c.uri)
              .map((c) => ({
                uri: c.uri,
                local: c.local || false,
                relay: false,
              })),
        )

        const reachable = await testConnectionReachability(
          candidates,
          plexToken,
          fastify.log,
          3000,
        )
        const reachableUris = new Set(reachable.map((r) => r.uri))
        const hasReachable = reachableUris.size > 0

        if (!hasReachable && candidates.length > 0) {
          fastify.log.warn(
            'No Plex connections passed reachability test - returning all as fallback',
          )
        }

        for (const server of serverResources) {
          for (const connection of server.connections || []) {
            if (!connection.uri) continue
            if (hasReachable && !reachableUris.has(connection.uri)) continue

            try {
              const url = new URL(connection.uri)

              if (url.hostname) {
                serverOptions.push({
                  name: `${server.name} (${url.hostname})`,
                  host: url.hostname,
                  port:
                    connection.port || Number.parseInt(url.port, 10) || 32400,
                  useSsl: true,
                  local: connection.local || false,
                })
              }

              if (connection.address) {
                serverOptions.push({
                  name: `${server.name} (${connection.address})`,
                  host: connection.address,
                  port: connection.port || 32400,
                  useSsl: false,
                  local: connection.local || false,
                })
              }
            } catch (e) {
              fastify.log.warn(
                { error: e },
                `Invalid server connection URI: ${connection.uri}`,
              )
            }
          }
        }

        fastify.log.info(
          `Found ${serverOptions.length} Plex server connection options`,
        )

        return {
          success: true,
          servers: serverOptions,
          message: `Found ${serverOptions.length} Plex servers`,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to discover Plex servers',
        })

        if (error instanceof Error && error.name === 'AbortError') {
          return reply.gatewayTimeout(
            'Request to Plex API timed out after 10 seconds',
          )
        }

        if (
          typeof error === 'object' &&
          error !== null &&
          'statusCode' in error &&
          'error' in error
        ) {
          throw error
        }

        if (error instanceof PlexApiError) {
          const status = error.status

          if (status === 400) {
            return reply.badRequest(error.message)
          }

          if (status === 401) {
            return reply.unauthorized(error.message)
          }

          if (status === 403) {
            return reply.forbidden(error.message)
          }

          if (status === 404) {
            return reply.notFound(error.message)
          }

          if (status >= 500) {
            return reply.internalServerError(error.message)
          }

          return reply.badRequest(error.message)
        }

        if (error instanceof Error) {
          return reply.internalServerError(error.message)
        }

        return reply.internalServerError('Failed to discover Plex servers')
      }
    },
  )
}

export default plugin
