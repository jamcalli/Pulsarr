import type { PlexResource } from '@root/types/plex-server.types.js'

type PlexConnection = PlexResource['connections'][number]

export function plexConnection(
  overrides: Partial<PlexConnection> = {},
): PlexConnection {
  return {
    protocol: 'https',
    address: '192.168.1.10',
    port: 32400,
    uri: 'https://192-168-1-10.abc.plex.direct:32400',
    local: true,
    relay: false,
    IPv6: false,
    ...overrides,
  }
}

export function plexResource(
  overrides: Partial<PlexResource> = {},
): PlexResource {
  return {
    name: 'Basement',
    product: 'Plex Media Server',
    productVersion: '1.41.0',
    platform: 'Linux',
    platformVersion: '6.1',
    device: 'PC',
    clientIdentifier: 'machine-1',
    createdAt: '2024-01-01T00:00:00Z',
    lastSeenAt: '2026-10-14T00:00:00Z',
    provides: 'server',
    ownerId: null,
    sourceTitle: null,
    publicAddress: '73.42.118.9',
    accessToken: 'server-token',
    owned: true,
    home: false,
    synced: false,
    relay: true,
    presence: true,
    httpsRequired: false,
    publicAddressMatches: true,
    dnsRebindingProtection: false,
    natLoopbackSupported: true,
    connections: [plexConnection()],
    ...overrides,
  }
}

/** The body a Plex server returns from `/identity` and, with a token, from `/`. */
export const PLEX_IDENTITY = {
  MediaContainer: { machineIdentifier: 'machine-1' },
}
