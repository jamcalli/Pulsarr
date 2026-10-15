/** Why a probe failed, kept inside the server to pick the message shown to the admin. */
export type ProbeFailure =
  | 'unreachable'
  | 'certificate'
  | 'auth'
  | 'unavailable'
  | 'invalid'

export type ProbeOutcome =
  | { ok: true; elapsedMs: number }
  | { ok: false; reason: ProbeFailure; status: number | null }

export interface ProbedConnection<C> {
  connection: C
  outcome: ProbeOutcome
}

// Bun puts the system error code on the fetch error itself, Node puts it on error.cause
const ERROR_CODE_FAILURES: Record<string, ProbeFailure> = {
  ENOTFOUND: 'unreachable',
  EAI_AGAIN: 'unreachable',
  EAI_NONAME: 'unreachable',
  EAI_FAIL: 'unreachable',
  ECONNREFUSED: 'unreachable',
  ConnectionRefused: 'unreachable',
  EHOSTUNREACH: 'unreachable',
  ENETUNREACH: 'unreachable',
  EHOSTDOWN: 'unreachable',
  ENETDOWN: 'unreachable',
  FailedToOpenSocket: 'unreachable',
  ECONNRESET: 'unreachable',
  EPIPE: 'unreachable',
  ConnectionClosed: 'unreachable',
  UND_ERR_SOCKET: 'unreachable',
  ETIMEDOUT: 'unreachable',
  UND_ERR_CONNECT_TIMEOUT: 'unreachable',
  UND_ERR_HEADERS_TIMEOUT: 'unreachable',
  CERT_HAS_EXPIRED: 'certificate',
  CERT_NOT_YET_VALID: 'certificate',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'certificate',
  SELF_SIGNED_CERT_IN_CHAIN: 'certificate',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'certificate',
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'certificate',
  ERR_TLS_CERT_ALTNAME_INVALID: 'certificate',
  ERR_SSL_WRONG_VERSION_NUMBER: 'certificate',
  EPROTO: 'certificate',
}

const AUTH_STATUSES = new Set([401, 403])

const CONNECTED_MESSAGE = 'Connected to the Plex server.'

const FAILURE_MESSAGES: Record<ProbeFailure, string> = {
  unreachable: "Couldn't reach the Plex server at this address.",
  certificate: "The server's certificate doesn't match this address.",
  auth: "The Plex server didn't accept the linked account's token.",
  unavailable: 'The Plex server answered with an error. Try again shortly.',
  invalid: 'Something other than this Plex server answered at this address.',
}

export function okOutcome(elapsedMs: number): ProbeOutcome {
  return { ok: true, elapsedMs }
}

const SERVER_ERROR_STATUS = 500

export function httpFailureOutcome(status: number): ProbeOutcome {
  return { ok: false, reason: httpFailureReason(status), status }
}

function httpFailureReason(status: number): ProbeFailure {
  if (AUTH_STATUSES.has(status)) return 'auth'
  return status >= SERVER_ERROR_STATUS ? 'unavailable' : 'invalid'
}

/** The server id in a Plex MediaContainer body, which both `/identity` and `/` return, or null when the body is not one. */
export function plexMachineId(body: unknown): string | null {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('MediaContainer' in body)
  ) {
    return null
  }
  const container = body.MediaContainer
  if (
    typeof container !== 'object' ||
    container === null ||
    !('machineIdentifier' in container) ||
    typeof container.machineIdentifier !== 'string'
  ) {
    return null
  }
  return container.machineIdentifier
}

/** Maps a rejected fetch to a failure reason, defaulting to unreachable for timeouts and unknown errors. */
export function classifyProbeError(error: unknown): ProbeFailure {
  const code = errorCode(error) ?? errorCode(errorCause(error))
  return (code && ERROR_CODE_FAILURES[code]) || 'unreachable'
}

/** The connection test verdict for an access check, with the message shown to the user. */
export function connectionTestResult(outcome: ProbeOutcome) {
  return outcome.ok
    ? { success: true, message: CONNECTED_MESSAGE }
    : { success: false, message: FAILURE_MESSAGES[outcome.reason] }
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
