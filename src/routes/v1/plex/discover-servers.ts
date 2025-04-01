import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { randomUUID } from 'node:crypto'

// Define types for Plex API responses
interface PlexResourceConnection {
  uri: string;
  address: string;
  port: number;
  protocol?: string;
  local: boolean;
}

interface PlexResource {
  name: string;
  owned: boolean;
  provides: string[] | string;
  connections: PlexResourceConnection[];
}

// Schema for the token request
const PlexTokenSchema = z.object({
  plexToken: z.string().min(1, 'Plex token is required'),
})

// Schema for server discovery response
const PlexServerResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  servers: z.array(z.object({
    name: z.string(),
    host: z.string(),
    port: z.number(),
    useSsl: z.boolean(),
    local: z.boolean(),
  })),
})

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/discover-servers',
    {
      schema: {
        body: PlexTokenSchema,
        response: {
          200: PlexServerResponseSchema,
          400: z.object({ error: z.string() }),
          500: z.object({ error: z.string() }),
        },
        tags: ['Plex'],
      },
    },
    async (request, reply) => {
      try {
        const { plexToken } = request.body as { plexToken: string }

        if (!plexToken) {
          return reply.code(400).send({ 
            error: 'Plex token is required' 
          })
        }

        // Generate a simple client ID
        const clientId = `pulsarr-${randomUUID()}`

        fastify.log.info('Discovering Plex servers using provided token')

        // Build the request to Plex.tv API
        const url = new URL('https://plex.tv/api/v2/resources')
        url.searchParams.append('includeHttps', '1')
        url.searchParams.append('includeRelay', '0')
        url.searchParams.append('includeIPv6', '0')
        
        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'X-Plex-Token': plexToken,
            'X-Plex-Client-Identifier': 'pulsarr',
            'X-Plex-Product': 'Pulsarr',
            'X-Plex-Platform': 'Web'
          }
        })
        
        if (!response.ok) {
          throw new Error(`Failed to fetch Plex servers: ${response.statusText}`)
        }
        
        const resources = await response.json() as PlexResource[]
        
        // Extract server options from resources
        const serverOptions = []
        
        // Filter resources that provide server functionality and are owned by the user
        const serverResources = resources.filter(r => 
          r.provides && 
          (Array.isArray(r.provides) ? r.provides.includes('server') : r.provides.split(',').includes('server')) && 
          r.owned
        )
        
        for (const server of serverResources) {
          // For each server, add all viable connection options
          for (const connection of server.connections || []) {
            if (!connection.uri) continue
            
            try {
              const url = new URL(connection.uri)
              const isSecure = url.protocol === 'https:'
              
              serverOptions.push({
                name: `${server.name} (${connection.address || url.hostname})`,
                host: connection.address || url.hostname,
                port: connection.port || parseInt(url.port, 10) || (isSecure ? 443 : 80),
                useSsl: isSecure,
                local: connection.local || false,
              })
            } catch (e) {
              fastify.log.warn(`Invalid server connection URI: ${connection.uri}`, e)
            }
          }
        }

        fastify.log.info(`Found ${serverOptions.length} Plex server connection options`)
        
        return {
          success: true,
          servers: serverOptions,
          message: `Found ${serverOptions.length} Plex servers`,
        }
      } catch (err) {
        fastify.log.error('Error discovering Plex servers:', err)
        
        return reply.code(500).send({ 
          error: err instanceof Error ? err.message : 'Failed to discover Plex servers' 
        })
      }
    },
  )
}

export default plugin