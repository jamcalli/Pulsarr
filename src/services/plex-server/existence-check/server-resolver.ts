import type { CacheRegistry } from '@services/cache-registry.service.js'
import {
  type ServerCandidates,
  warnCandidateFallback,
} from '@services/plex-server/connection/candidates.js'
import {
  probeConnections,
  probeServerAccess,
} from '@services/plex-server/connection/probe.js'
import { rankProbedConnections } from '@services/plex-server/connection/ranking.js'
import type { FastifyBaseLogger } from 'fastify'

/** A Plex server the existence check queries, at its best working address with the token it accepts. */
export interface ExistenceServer {
  clientId: string
  name: string
  uri: string
  accessToken: string
}

export interface SharedServerResolver {
  /** Null while the server is in dead-server backoff or when none of its connections works. */
  resolve(server: ServerCandidates): Promise<ExistenceServer | null>
  invalidate(clientId: string): void
  clear(): void
}

export const DEAD_SERVER_BACKOFF_MS = 5 * 60 * 1000

const SHARED_SERVER_CACHE_MAX = 100

/** Resolves each shared server once per TTL, keyed by client identifier, and backs off from one that failed. */
export function createSharedServerResolver(
  registry: CacheRegistry,
  ttlMs: number,
  log: FastifyBaseLogger,
): SharedServerResolver {
  const deadServers = registry.create<string, true>({
    max: SHARED_SERVER_CACHE_MAX,
    ttl: DEAD_SERVER_BACKOFF_MS,
  })
  const servers = registry.create<string, ExistenceServer, ServerCandidates>({
    max: SHARED_SERVER_CACHE_MAX,
    ttl: ttlMs,
    // A clear mid-probe still answers its waiting callers but is not written back
    ignoreFetchAbort: true,
    fetchMethod: async (clientId, _stale, { context, signal }) => {
      const server = await resolveSharedServer(context, log)
      if (!signal.aborted) {
        if (server) deadServers.delete(clientId)
        else deadServers.set(clientId, true)
      }
      return server ?? undefined
    },
  })

  return {
    async resolve(candidates) {
      const { clientIdentifier, name } = candidates.resource
      if (deadServers.has(clientIdentifier)) {
        log.debug({ server: name }, 'Skipping Plex server in backoff period')
        return null
      }
      return (
        (await servers.fetch(clientIdentifier, { context: candidates })) ?? null
      )
    },
    invalidate(clientId) {
      const cached = servers.peek(clientId)
      if (!cached) return
      log.warn(
        { server: cached.name },
        'Dropping the cached Plex server connection',
      )
      servers.delete(clientId)
    },
    clear() {
      servers.clear()
      deadServers.clear()
    },
  }
}

async function resolveSharedServer(
  candidates: ServerCandidates,
  log: FastifyBaseLogger,
): Promise<ExistenceServer | null> {
  const { resource, connections } = candidates
  warnCandidateFallback(log, candidates)
  if (!resource.accessToken) {
    log.debug(
      { server: resource.name },
      'Skipping shared Plex server without an access token',
    )
    return null
  }

  const [best] = rankProbedConnections(
    await probeConnections(
      connections.map((connection) => ({
        ...connection,
        machineId: resource.clientIdentifier,
      })),
      log,
    ),
  )
  if (!best?.outcome.ok) {
    log.warn(
      { server: resource.name },
      'No working connection found for shared Plex server',
    )
    return null
  }

  const access = await probeServerAccess(
    best.connection.uri,
    resource.accessToken,
    log,
  )
  if (!access.ok) {
    log.warn(
      { server: resource.name, reason: access.reason },
      'Shared Plex server failed its access check',
    )
    return null
  }

  return {
    clientId: resource.clientIdentifier,
    name: resource.name,
    uri: best.connection.uri,
    accessToken: resource.accessToken,
  }
}
