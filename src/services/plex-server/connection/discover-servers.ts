import { probeConnections } from '@services/plex-server/existence-check/connection-cache.js'
import { getAllPlexResources } from '@services/plex-server/resources/resource-operations.js'
import type { FastifyBaseLogger } from 'fastify'
import { serverCandidates, warnCandidateFallback } from './candidates.js'
import { discoveryOptions } from './discovery-options.js'
import { connectionTestResult } from './probe-result.js'
import { rankProbedConnections } from './ranking.js'

/** The token's owned server addresses, best first, with whether Pulsarr reached each one. */
export async function discoverServerConnections(
  plexToken: string,
  log: FastifyBaseLogger,
) {
  const resources = await getAllPlexResources(plexToken, { ownedOnly: true })
  const servers = serverCandidates(resources)
  for (const server of servers) warnCandidateFallback(log, server)

  const probed = await probeConnections(discoveryOptions(servers), log)
  return rankProbedConnections(probed).map(({ connection, outcome }) => ({
    name: connection.name,
    host: connection.host,
    port: connection.port,
    useSsl: connection.useSsl,
    local: connection.local,
    ...connectionTestResult(outcome),
  }))
}
