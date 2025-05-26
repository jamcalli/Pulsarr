import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  PlexTokenSchema,
  PlexServerResponseSchema,
  PlexServerErrorSchema,
} from '@schemas/plex/discover-servers.schema.js'

// Types for Plex API responses
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

// Helper class to carry HTTP status information
class PlexApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
    this.name = 'PlexApiError'
  }
}

export const discoverServersRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: z.infer<typeof PlexTokenSchema>
    Reply: z.infer<typeof PlexServerResponseSchema>
  }>(
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
        },
        tags: ['Plex'],
      },
    },
    async (request, reply) => {
      try {
        const { plexToken } = request.body

        if (!plexToken) {
          return reply.badRequest('Plex token is required')
        }

        fastify.log.info('Discovering Plex servers using provided token')

        // Build the request to Plex.tv API
        const url = new URL('https://plex.tv/api/v2/resources')
        url.searchParams.append('includeHttps', '1')
        url.searchParams.append('includeRelay', '0')
        url.searchParams.append('includeIPv6', '0')

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'X-Plex-Token': plexToken,
            'X-Plex-Client-Identifier': 'pulsarr',
            'X-Plex-Product': 'Pulsarr',
            'X-Plex-Platform': 'Web',
          },
        })

        if (!response.ok) {
          // Pass along the HTTP status code with the error
          throw new PlexApiError(
            `Failed to fetch Plex servers: ${response.statusText}`,
            response.status,
          )
        }

        const resources = (await response.json()) as PlexResource[]

        // Extract server options from resources
        const serverOptions = []

        // Filter resources that provide server functionality and are owned by the user
        const serverResources = resources.filter(
          (r) =>
            r.provides &&
            (Array.isArray(r.provides)
              ? r.provides.includes('server')
              : r.provides.split(',').includes('server')) &&
            r.owned,
        )

        for (const server of serverResources) {
          // For each server, add all viable connection options
          for (const connection of server.connections || []) {
            if (!connection.uri) continue

            try {
              const url = new URL(connection.uri)
              const isSecure = url.protocol === 'https:'

              // Add option with direct Plex URL (secure)
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

              // Add option with direct IP address (non-secure by default)
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
                `Invalid server connection URI: ${connection.uri}`,
                e,
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
      } catch (err: unknown) {
        fastify.log.error('Error discovering Plex servers:', err)

        // Handle Fastify-specific errors
        if (
          typeof err === 'object' &&
          err !== null &&
          'statusCode' in err &&
          'error' in err
        ) {
          throw err
        }

        // Handle our PlexApiError
        if (err instanceof PlexApiError) {
          // Map HTTP status codes to appropriate Fastify replies
          const status = err.status

          if (status === 400) {
            return reply.badRequest(err.message)
          }

          if (status === 401) {
            return reply.unauthorized(err.message)
          }

          if (status === 403) {
            return reply.forbidden(err.message)
          }

          if (status === 404) {
            return reply.notFound(err.message)
          }

          if (status >= 500) {
            return reply.internalServerError(err.message)
          }

          // For any other client errors (default case)
          return reply.badRequest(err.message)
        }

        // Default error handling for unexpected errors
        if (err instanceof Error) {
          return reply.internalServerError(err.message)
        }

        return reply.internalServerError('Failed to discover Plex servers')
      }
    },
  )
}
