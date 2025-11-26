/**
 * Server List Builder Module
 *
 * Provides functions for building the list of unique servers to check
 * for content existence. Each server entry contains all its connections
 * for the connection selection logic to choose the best one.
 */

import type {
  PlexResource,
  PlexServerConnectionInfo,
} from '@root/types/plex-server.types.js'
import type { FastifyBaseLogger } from 'fastify'

/** Server entry for existence checking */
export interface ServerToCheck {
  clientIdentifier: string
  name: string
  connections: Array<{ uri: string; local: boolean; relay: boolean }>
  accessToken: string
}

/** Dependencies for server list building */
export interface ServerListBuilderDeps {
  logger: FastifyBaseLogger
  serverMachineId: string | null
}

/**
 * Builds a list of unique servers to check (one entry per server, not per connection).
 * Each server entry contains all its connections for the connection selection logic.
 *
 * @param ownerConnections - The owner's server connections from getPlexServerConnectionInfo()
 * @param allResources - All Plex resources from plex.tv API
 * @param adminToken - The admin token for owner's server
 * @param isPrimaryUser - Whether to include shared servers
 * @param deps - Service dependencies
 * @returns Array of server objects with their available connections
 */
export function buildUniqueServerList(
  ownerConnections: PlexServerConnectionInfo[],
  allResources: PlexResource[],
  adminToken: string,
  isPrimaryUser: boolean,
  deps: ServerListBuilderDeps,
): ServerToCheck[] {
  const { logger, serverMachineId } = deps
  const servers: ServerToCheck[] = []

  // Find the owner's server resource to get its clientIdentifier
  const ownerResource = allResources.find(
    (r) => r.clientIdentifier === serverMachineId || r.owned === true,
  )

  if (ownerConnections.length > 0) {
    const ownerClientId = ownerResource?.clientIdentifier || 'owner-server'
    const ownerName = ownerResource?.name ?? 'Owner Plex Server'

    servers.push({
      clientIdentifier: ownerClientId,
      name: ownerName,
      connections: ownerConnections.map((c) => ({
        uri: c.url,
        local: c.local,
        relay: c.relay,
      })),
      accessToken: adminToken,
    })

    logger.debug(
      `Added owner's server "${ownerName}" with ${ownerConnections.length} connection(s)`,
    )
  }

  // Add shared servers only if the user is the primary token user
  if (isPrimaryUser) {
    const sharedServers = allResources.filter(
      (r) =>
        r.owned === false &&
        r.clientIdentifier !== serverMachineId &&
        r.connections &&
        r.connections.length > 0,
    )

    let addedCount = 0
    for (const server of sharedServers) {
      if (!server.accessToken) {
        logger.debug(
          `Skipping shared server "${server.name}" - no access token`,
        )
        continue
      }

      servers.push({
        clientIdentifier: server.clientIdentifier,
        name: server.name,
        connections: server.connections
          .filter((c) => c.uri)
          .map((c) => ({
            uri: c.uri,
            local: c.local ?? false,
            relay: c.relay ?? false,
          })),
        accessToken: server.accessToken,
      })
      addedCount++
    }

    logger.debug(`Added ${addedCount} shared server(s)`)
  } else {
    logger.debug(
      'Skipping shared servers check - user is not primary token user',
    )
  }

  return servers
}
