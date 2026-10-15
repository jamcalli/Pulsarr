import { probeConnections } from '@services/plex-server/existence-check/connection-cache.js'
import { getAllPlexResources } from '@services/plex-server/resources/resource-operations.js'
import type { FastifyBaseLogger } from 'fastify'
import { serverCandidates, warnCandidateFallback } from './candidates.js'
import { discoveryOptions } from './discovery-options.js'
import { rankProbedConnections } from './ranking.js'

const DISCOVERY_PROBE_TIMEOUT_MS = 3000

/** Every address of the token's owned servers, best first, with the first one recommended when reachable. */
export async function discoverServerConnections(
  plexToken: string,
  log: FastifyBaseLogger,
) {
  const resources = await getAllPlexResources(plexToken, { ownedOnly: true })
  const servers = serverCandidates(resources)
  for (const server of servers) warnCandidateFallback(log, server)

  const probed = await probeConnections(
    discoveryOptions(servers),
    log,
    DISCOVERY_PROBE_TIMEOUT_MS,
  )
  return rankProbedConnections(probed).map(
    ({ connection, outcome }, index) => ({
      name: connection.name,
      host: connection.host,
      port: connection.port,
      useSsl: connection.useSsl,
      local: connection.local,
      reachable: outcome.reachable,
      latencyMs: outcome.latencyMs,
      failure: outcome.failure,
      recommended: index === 0 && outcome.reachable,
    }),
  )
}
