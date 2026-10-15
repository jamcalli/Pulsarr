import type { ProbedConnection } from './probe-result.js'

export interface RankableConnection {
  uri: string
  local: boolean
}

/** Best first: reachable, then https, then local, then lowest latency. */
export function rankProbedConnections<C extends RankableConnection>(
  probed: ProbedConnection<C>[],
): ProbedConnection<C>[] {
  return [...probed].sort(
    (a, b) =>
      Number(b.outcome.reachable) - Number(a.outcome.reachable) ||
      Number(isHttps(b.connection.uri)) - Number(isHttps(a.connection.uri)) ||
      Number(b.connection.local) - Number(a.connection.local) ||
      (a.outcome.latencyMs ?? Number.POSITIVE_INFINITY) -
        (b.outcome.latencyMs ?? Number.POSITIVE_INFINITY),
  )
}

function isHttps(uri: string): boolean {
  return uri.toLowerCase().startsWith('https:')
}
