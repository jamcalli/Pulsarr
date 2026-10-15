import type { ProbedConnection, ProbeOutcome } from './probe-result.js'

export interface RankableConnection {
  uri: string
  local: boolean
}

/** Working first, then local since the arrs get the same address, then https, then fastest. */
export function rankProbedConnections<C extends RankableConnection>(
  probed: ProbedConnection<C>[],
): ProbedConnection<C>[] {
  return [...probed].sort(
    (a, b) =>
      Number(b.outcome.ok) - Number(a.outcome.ok) ||
      Number(b.connection.local) - Number(a.connection.local) ||
      Number(isHttps(b.connection.uri)) - Number(isHttps(a.connection.uri)) ||
      elapsedMs(a.outcome) - elapsedMs(b.outcome),
  )
}

function isHttps(uri: string): boolean {
  return uri.toLowerCase().startsWith('https:')
}

function elapsedMs(outcome: ProbeOutcome): number {
  return outcome.ok ? outcome.elapsedMs : Number.POSITIVE_INFINITY
}
