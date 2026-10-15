import type { PlexResource } from '@root/types/plex-server.types.js'
import type { FastifyBaseLogger } from 'fastify'

export type PlexResourceConnection = PlexResource['connections'][number]

export type CandidateFallback = 'relay-only' | 'https-required'

export interface ServerCandidates {
  resource: PlexResource
  connections: PlexResourceConnection[]
  /** Set when filtering left nothing, so `connections` is the unfiltered list. */
  fallback: CandidateFallback | null
}

const CANDIDATE_FALLBACK_REASONS: Record<CandidateFallback, string> = {
  'relay-only': 'Plex lists only relay connections for this server',
  'https-required':
    'the server requires https but Plex lists no https connection for it',
}

/** Owned Plex Media Servers with their usable connections, in plex.tv order. */
export function serverCandidates(
  resources: PlexResource[],
): ServerCandidates[] {
  return resources
    .filter(
      (resource) =>
        resource.product === 'Plex Media Server' &&
        resource.owned === true &&
        (resource.connections?.length ?? 0) > 0,
    )
    .map(resourceCandidates)
}

function resourceCandidates(resource: PlexResource): ServerCandidates {
  const all = resource.connections
  const direct = all.filter((connection) => !connection.relay)
  if (direct.length === 0) {
    return { resource, connections: all, fallback: 'relay-only' }
  }
  if (!resource.httpsRequired) {
    return { resource, connections: direct, fallback: null }
  }
  const secure = direct.filter((connection) => connection.protocol === 'https')
  if (secure.length === 0) {
    return { resource, connections: all, fallback: 'https-required' }
  }
  return { resource, connections: secure, fallback: null }
}

export function warnCandidateFallback(
  log: FastifyBaseLogger,
  { resource, fallback }: ServerCandidates,
): void {
  if (!fallback) return
  log.warn(
    { server: resource.name },
    `Keeping every connection for "${resource.name}" because ${CANDIDATE_FALLBACK_REASONS[fallback]}`,
  )
}
