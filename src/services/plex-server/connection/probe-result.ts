import type { PlexProbeFailure } from '@root/schemas/plex/connection-probe.schema.js'

export type ProbeOutcome =
  | { reachable: true; latencyMs: number; failure: null; httpStatus: null }
  | {
      reachable: false
      latencyMs: null
      failure: PlexProbeFailure
      httpStatus: number | null
    }

export interface ProbedConnection<C> {
  connection: C
  outcome: ProbeOutcome
}

// Bun puts the system error code on the fetch error itself, Node puts it on error.cause
const ERROR_CODE_FAILURES: Record<string, PlexProbeFailure> = {
  ENOTFOUND: 'dns',
  EAI_AGAIN: 'dns',
  EAI_NONAME: 'dns',
  EAI_FAIL: 'dns',
  ECONNREFUSED: 'refused',
  ConnectionRefused: 'refused',
  EHOSTUNREACH: 'unreachable',
  ENETUNREACH: 'unreachable',
  EHOSTDOWN: 'unreachable',
  ENETDOWN: 'unreachable',
  FailedToOpenSocket: 'unreachable',
  ECONNRESET: 'reset',
  EPIPE: 'reset',
  ConnectionClosed: 'reset',
  UND_ERR_SOCKET: 'reset',
  CERT_HAS_EXPIRED: 'tls',
  CERT_NOT_YET_VALID: 'tls',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'tls',
  SELF_SIGNED_CERT_IN_CHAIN: 'tls',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'tls',
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'tls',
  ERR_TLS_CERT_ALTNAME_INVALID: 'tls',
  ERR_SSL_WRONG_VERSION_NUMBER: 'tls',
  EPROTO: 'tls',
  ETIMEDOUT: 'timeout',
  UND_ERR_CONNECT_TIMEOUT: 'timeout',
  UND_ERR_HEADERS_TIMEOUT: 'timeout',
}

export function reachableOutcome(latencyMs: number): ProbeOutcome {
  return { reachable: true, latencyMs, failure: null, httpStatus: null }
}

const UNAUTHORIZED_STATUSES = new Set([401, 403])

export function httpFailureOutcome(status: number): ProbeOutcome {
  return {
    reachable: false,
    latencyMs: null,
    failure: UNAUTHORIZED_STATUSES.has(status) ? 'unauthorized' : 'http',
    httpStatus: status,
  }
}

/** Maps a rejected fetch to a failure category, defaulting to unreachable for unknown errors. */
export function classifyProbeError(error: unknown): PlexProbeFailure {
  if (isTimeout(error)) return 'timeout'
  const code = errorCode(error) ?? errorCode(errorCause(error))
  return (code && ERROR_CODE_FAILURES[code]) || 'unreachable'
}

export function failedOutcome(error: unknown): ProbeOutcome {
  return {
    reachable: false,
    latencyMs: null,
    failure: classifyProbeError(error),
    httpStatus: null,
  }
}

function isTimeout(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('name' in error)) {
    return false
  }
  return error.name === 'TimeoutError' || error.name === 'AbortError'
}

function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null
  }
  return typeof error.code === 'string' ? error.code : null
}

function errorCause(error: unknown): unknown {
  return error instanceof Error ? error.cause : undefined
}
