/**
 * Connection Cache Module
 *
 * Provides functions for caching and managing Plex server connections.
 * Uses lightweight /identity endpoint to test connections with fast timeouts.
 * All functions are pure and receive cache state as parameters.
 */

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

/** Cached connection entry with TTL tracking */
export interface CachedConnection {
  uri: string
  accessToken: string
  timestamp: number
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

/** Dependencies for connection cache operations */
export interface ConnectionCacheDeps {
  logger: FastifyBaseLogger
  connectionCacheTtl: number
  deadServerBackoff: number
}

/**
 * Checks if a server is in dead server backoff period.
 *
 * @param serverClientId - Unique identifier for the server
 * @param deadServerCache - Map of server IDs to death timestamps
 * @param backoffMs - Backoff period in milliseconds
 * @returns true if server is in backoff period
 */
export function isServerInBackoff(
  serverClientId: string,
  deadServerCache: Map<string, number>,
  backoffMs: number,
): boolean {
  const deadSince = deadServerCache.get(serverClientId)
  return deadSince !== undefined && Date.now() - deadSince < backoffMs
}

/**
 * Gets a cached connection if valid (not expired).
 *
 * @param serverClientId - Unique identifier for the server
 * @param connectionCache - Map of server IDs to cached connections
 * @param ttlMs - Cache TTL in milliseconds
 * @returns Cached connection result or null if expired/missing
 */
export function getCachedConnection(
  serverClientId: string,
  connectionCache: Map<string, CachedConnection>,
  ttlMs: number,
): ConnectionResult | null {
  const cached = connectionCache.get(serverClientId)
  if (cached && Date.now() - cached.timestamp < ttlMs) {
    return { uri: cached.uri, accessToken: cached.accessToken }
  }
  return null
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
      return { ok: false, code: 'invalid', status: response.status }
    }
    logger.debug(`Connection test failed for ${uri}: HTTP ${response.status}`)
    return httpFailureOutcome(response.status)
  } catch (error) {
    const code = classifyProbeError(error)
    logger.debug({ error, uri, code }, 'Connection test failed')
    return { ok: false, code, status: null }
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

/**
 * Gets the best working connection for a server, with caching and failover.
 * Uses lightweight /identity endpoint to test connections with 2s timeout.
 *
 * @param serverClientId - Unique identifier for the server
 * @param serverName - Human-readable server name for logging
 * @param connections - Array of available connections to test
 * @param accessToken - Token to use for authentication
 * @param connectionCache - Map to store cached connections
 * @param deadServerCache - Map to track dead servers for backoff
 * @param deps - Service dependencies (logger, TTL config)
 * @returns The best working connection or null if all fail
 */
export async function getBestServerConnection(
  serverClientId: string,
  serverName: string,
  connections: ConnectionCandidate[],
  accessToken: string,
  connectionCache: Map<string, CachedConnection>,
  deadServerCache: Map<string, number>,
  deps: ConnectionCacheDeps,
): Promise<ConnectionResult | null> {
  const { logger, connectionCacheTtl, deadServerBackoff } = deps

  // Check dead server backoff first
  if (isServerInBackoff(serverClientId, deadServerCache, deadServerBackoff)) {
    logger.debug(`Skipping server "${serverName}" (in backoff period)`)
    return null
  }

  // Check cache
  const cached = getCachedConnection(
    serverClientId,
    connectionCache,
    connectionCacheTtl,
  )
  if (cached) {
    logger.debug(`Using cached connection for server "${serverName}"`)
    return cached
  }

  // Test connections in parallel using lightweight /identity endpoint
  logger.debug(
    `Testing ${connections.length} connections for server "${serverName}"`,
  )

  const workingConnections = await testConnections(connections, logger)

  if (workingConnections.length === 0) {
    logger.warn(`No working connections found for server "${serverName}"`)
    // Mark server as dead for backoff
    deadServerCache.set(serverClientId, Date.now())
    return null
  }

  // Clear any dead server status
  deadServerCache.delete(serverClientId)

  const bestConnection = workingConnections[0]

  // Cache the result
  connectionCache.set(serverClientId, {
    uri: bestConnection.uri,
    accessToken,
    timestamp: Date.now(),
    serverName,
  })

  logger.info(
    `Selected best connection for server "${serverName}": ${bestConnection.uri}`,
  )

  return { uri: bestConnection.uri, accessToken }
}

/**
 * Invalidates a cached connection (called on connection failure).
 * This allows the next request to re-test connections and select a new one.
 *
 * @param serverClientId - The server identifier to invalidate
 * @param connectionCache - Map of cached connections
 * @param logger - Logger instance
 */
export function invalidateServerConnection(
  serverClientId: string,
  connectionCache: Map<string, CachedConnection>,
  logger: FastifyBaseLogger,
): void {
  const cached = connectionCache.get(serverClientId)
  if (cached) {
    logger.warn(
      `Invalidating cached connection for server "${cached.serverName}"`,
    )
    connectionCache.delete(serverClientId)
  }
}
