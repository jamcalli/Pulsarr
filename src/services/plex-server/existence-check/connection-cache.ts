/**
 * Connection Cache Module
 *
 * Provides functions for caching and managing Plex server connections.
 * Uses lightweight /identity endpoint to test connections with fast timeouts.
 */

import type { CacheRegistry } from '@services/cache-registry.service.js'
import {
  classifyProbeError,
  httpFailureOutcome,
  okOutcome,
  type ProbedConnection,
  type ProbeOutcome,
  plexMachineId,
} from '@services/plex-server/connection/probe-result.js'
import { PLEX_CLIENT_IDENTIFIER } from '@utils/version.js'
import type { FastifyBaseLogger } from 'fastify'
import type { LRUCache } from 'lru-cache'

export const SERVER_CONNECTION_CACHE_TTL_MS = 30 * 60 * 1000

const SERVER_CONNECTION_CACHE_MAX = 100

export interface CachedConnection {
  uri: string
  accessToken: string
  serverName: string
}

/** Connection info returned from cache lookup */
export interface ConnectionResult {
  uri: string
  accessToken: string
}

/** Connection to test */
export interface ConnectionCandidate {
  uri: string
  local: boolean
  relay: boolean
}

export interface ServerConnectionRequest {
  serverName: string
  connections: ConnectionCandidate[]
  accessToken: string
}

/** Keyed by server client id. A server with no working connection is never stored. */
export type ServerConnectionCache = LRUCache<
  string,
  CachedConnection,
  ServerConnectionRequest
>

function isServerInBackoff(
  serverClientId: string,
  deadServerCache: Map<string, number>,
  backoffMs: number,
): boolean {
  const deadSince = deadServerCache.get(serverClientId)
  return deadSince !== undefined && Date.now() - deadSince < backoffMs
}

export const PLEX_PROBE_TIMEOUT_MS = 2000

/** Probes each connection's /identity in parallel and keeps the input order, requiring `machineId` to match when set. */
export async function probeConnections<
  C extends { uri: string; machineId?: string },
>(
  connections: C[],
  logger: FastifyBaseLogger,
  timeoutMs = PLEX_PROBE_TIMEOUT_MS,
): Promise<ProbedConnection<C>[]> {
  return Promise.all(
    connections.map(async (connection) => ({
      connection,
      outcome: await probeConnection(
        connection.uri,
        logger,
        timeoutMs,
        connection.machineId ?? null,
      ),
    })),
  )
}

async function probePath(
  uri: string,
  path: string,
  accessToken: string | null,
  logger: FastifyBaseLogger,
  timeoutMs = PLEX_PROBE_TIMEOUT_MS,
  expectedMachineId: string | null = null,
): Promise<ProbeOutcome> {
  const started = performance.now()
  try {
    const response = await fetch(`${uri}${path}`, {
      headers: {
        Accept: 'application/json',
        'X-Plex-Client-Identifier': PLEX_CLIENT_IDENTIFIER,
        ...(accessToken ? { 'X-Plex-Token': accessToken } : {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (response.ok) {
      const elapsedMs = Math.round(performance.now() - started)
      const machineId = plexMachineId(await readJson(response))
      if (
        machineId !== null &&
        (expectedMachineId === null || machineId === expectedMachineId)
      ) {
        return okOutcome(elapsedMs)
      }
      logger.debug(
        `Connection test failed for ${uri}: not the expected Plex server`,
      )
      return { ok: false, reason: 'invalid', status: response.status }
    }
    logger.debug(`Connection test failed for ${uri}: HTTP ${response.status}`)
    return httpFailureOutcome(response.status)
  } catch (error) {
    const reason = classifyProbeError(error)
    logger.debug({ error, uri, reason }, 'Connection test failed')
    return { ok: false, reason, status: null }
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

/** Reachability only, sent without the token because `/identity` answers without one. */
export function probeConnection(
  uri: string,
  logger: FastifyBaseLogger,
  timeoutMs = PLEX_PROBE_TIMEOUT_MS,
  expectedMachineId: string | null = null,
): Promise<ProbeOutcome> {
  return probePath(uri, '/identity', null, logger, timeoutMs, expectedMachineId)
}

/** Reachability plus whether the server accepts the token, which fails as `auth` when it does not. */
export function probeServerAccess(
  uri: string,
  accessToken: string,
  logger: FastifyBaseLogger,
): Promise<ProbeOutcome> {
  return probePath(uri, '/', accessToken, logger, PLEX_PROBE_TIMEOUT_MS)
}

/** The reachable connections only, in their original order. */
export async function testConnectionReachability<C extends { uri: string }>(
  connections: C[],
  logger: FastifyBaseLogger,
  timeoutMs = PLEX_PROBE_TIMEOUT_MS,
): Promise<C[]> {
  const probed = await probeConnections(connections, logger, timeoutMs)
  return probed
    .filter(({ outcome }) => outcome.ok)
    .map(({ connection }) => connection)
}

/**
 * Tests connections in parallel using lightweight /identity endpoint.
 * Returns working connections sorted by preference (non-local, non-relay first).
 *
 * @param connections - Array of connections to test
 * @param logger - Logger instance
 * @returns Array of working connections sorted by preference
 */
async function testConnections(
  connections: ConnectionCandidate[],
  logger: FastifyBaseLogger,
): Promise<ConnectionCandidate[]> {
  const reachable = await testConnectionReachability(connections, logger)

  return reachable.sort((a, b) => {
    if (!a.local && b.local) return -1
    if (a.local && !b.local) return 1
    if (!a.relay && b.relay) return -1
    if (a.relay && !b.relay) return 1
    return 0
  })
}

async function selectBestConnection(
  serverClientId: string,
  { serverName, connections, accessToken }: ServerConnectionRequest,
  deadServerCache: Map<string, number>,
  logger: FastifyBaseLogger,
): Promise<CachedConnection | undefined> {
  logger.debug(
    `Testing ${connections.length} connections for server "${serverName}"`,
  )

  const workingConnections = await testConnections(connections, logger)
  const bestConnection = workingConnections[0]

  if (!bestConnection) {
    logger.warn(`No working connections found for server "${serverName}"`)
    deadServerCache.set(serverClientId, Date.now())
    return undefined
  }

  deadServerCache.delete(serverClientId)
  logger.debug(
    `Selected best connection for server "${serverName}": ${bestConnection.uri}`,
  )
  return { uri: bestConnection.uri, accessToken, serverName }
}

/** Shares one probe per server, and marks a server with no working connection in deadServerCache. */
export function createServerConnectionCache(
  registry: CacheRegistry,
  deadServerCache: Map<string, number>,
  logger: FastifyBaseLogger,
): ServerConnectionCache {
  return registry.create({
    max: SERVER_CONNECTION_CACHE_MAX,
    ttl: SERVER_CONNECTION_CACHE_TTL_MS,
    // A clear mid-probe still answers its waiting callers but is not written back
    ignoreFetchAbort: true,
    fetchMethod: (serverClientId, _stale, { context }) =>
      selectBestConnection(serverClientId, context, deadServerCache, logger),
  })
}

/** The best working connection for a server, or null while it is in dead-server backoff or when every connection fails. */
export async function getBestServerConnection(
  serverClientId: string,
  request: ServerConnectionRequest,
  connectionCache: ServerConnectionCache,
  deadServerCache: Map<string, number>,
  deps: { logger: FastifyBaseLogger; deadServerBackoff: number },
): Promise<ConnectionResult | null> {
  if (
    isServerInBackoff(serverClientId, deadServerCache, deps.deadServerBackoff)
  ) {
    deps.logger.debug(
      `Skipping server "${request.serverName}" (in backoff period)`,
    )
    return null
  }

  const connection = await connectionCache.fetch(serverClientId, {
    context: request,
  })
  return connection
    ? { uri: connection.uri, accessToken: connection.accessToken }
    : null
}

/** Drops a server's cached connection so the next lookup probes again. */
export function invalidateServerConnection(
  serverClientId: string,
  connectionCache: ServerConnectionCache,
  logger: FastifyBaseLogger,
): void {
  const cached = connectionCache.peek(serverClientId)
  if (cached) {
    logger.warn(
      `Invalidating cached connection for server "${cached.serverName}"`,
    )
    connectionCache.delete(serverClientId)
  }
}
