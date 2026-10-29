import type { PlexResource } from '@root/types/plex-server.types.js'
import type { FastifyBaseLogger } from 'fastify'

export type PlexResourceConnection = PlexResource['connections'][number]

export type CandidateFallback = 'relay-only' | 'https-required'

export interface ServerCandidates {
  resource: PlexResource
  connections: PlexResourceConnection[]
  /** Set when only relays are usable, or when https is required and none is listed. */
  fallback: CandidateFallback | null
}

const CANDIDATE_FALLBACK_WARNINGS: Record<CandidateFallback, string> = {
  'relay-only':
    'Plex lists only relay connections for this server, so Pulsarr uses those',
  'https-required':
    'This server requires https but Plex lists no https connection for it, so Pulsarr cannot use it',
}

/** Owned Plex Media Servers with their usable connections, in plex.tv order. */
export function serverCandidates(
  resources: PlexResource[],
): ServerCandidates[] {
  return mediaServerCandidates(resources, true)
}

/** Plex Media Servers shared with the account, with their usable connections, in plex.tv order. */
export function sharedServerCandidates(
  resources: PlexResource[],
): ServerCandidates[] {
  return mediaServerCandidates(resources, false)
}

function mediaServerCandidates(
  resources: PlexResource[],
  owned: boolean,
): ServerCandidates[] {
  return resources
    .filter(
      (resource) =>
        resource.product === 'Plex Media Server' &&
        resource.owned === owned &&
        (resource.connections?.length ?? 0) > 0,
    )
    .map(resourceCandidates)
}

function resourceCandidates(resource: PlexResource): ServerCandidates {
  const usable = resource.httpsRequired
    ? resource.connections.filter(
        (connection) => connection.protocol === 'https',
      )
    : resource.connections
  const direct = usable.filter((connection) => !connection.relay)
  if (direct.length > 0) {
    return { resource, connections: direct, fallback: null }
  }
  if (usable.length > 0) {
    return { resource, connections: usable, fallback: 'relay-only' }
  }
  return { resource, connections: [], fallback: 'https-required' }
}

export function warnCandidateFallback(
  log: FastifyBaseLogger,
  { resource, fallback }: ServerCandidates,
): void {
  if (!fallback) return
  log.warn({ server: resource.name }, CANDIDATE_FALLBACK_WARNINGS[fallback])
}
