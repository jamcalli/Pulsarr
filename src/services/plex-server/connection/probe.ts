import { PLEX_CLIENT_IDENTIFIER } from '@utils/version.js'
import type { FastifyBaseLogger } from 'fastify'
import {
  classifyProbeError,
  httpFailureOutcome,
  okOutcome,
  type ProbedConnection,
  type ProbeOutcome,
  plexMachineId,
} from './probe-result.js'

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
