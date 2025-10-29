import type { PlexResource } from '@root/types/plex-server.types.js'
import { HttpResponse, http } from 'msw'

/**
 * Default MSW handlers for Plex API endpoints
 *
 * These handlers prevent timeout errors in Vitest v4.
 * Vitest v4's fork pool rewrite is better at catching unhandled rejections than v3,
 * so HTTP requests from PlexServerService.initialize() that timeout after tests
 * complete are now caught as unhandled errors.
 *
 * These mocks ensure requests complete quickly instead of timing out at 30 seconds.
 */

export const plexResourcesHandler = http.get(
  'https://plex.tv/api/v2/resources',
  () => {
    const resources: PlexResource[] = [
      {
        name: 'Test Plex Server',
        product: 'Plex Media Server',
        productVersion: '1.32.0',
        platform: 'Linux',
        platformVersion: '5.15.0',
        device: 'PC',
        clientIdentifier: 'test-machine-id',
        createdAt: '2024-01-01T00:00:00Z',
        lastSeenAt: new Date().toISOString(),
        provides: 'server',
        ownerId: 'test-owner-id',
        sourceTitle: null,
        publicAddress: '192.168.1.100',
        accessToken: 'test-token',
        owned: true,
        home: true,
        synced: false,
        relay: false,
        presence: true,
        httpsRequired: false,
        publicAddressMatches: true,
        dnsRebindingProtection: false,
        natLoopbackSupported: true,
        connections: [
          {
            protocol: 'http',
            address: 'localhost',
            port: 32400,
            uri: 'http://localhost:32400',
            local: true,
            relay: false,
            IPv6: false,
          },
        ],
      },
    ]
    return HttpResponse.json(resources)
  },
)

export const plexUsersHandler = http.get('https://plex.tv/api/users', () => {
  return HttpResponse.text(
    `<?xml version="1.0" encoding="UTF-8"?><MediaContainer size="1"><User id="1" title="Test User" username="testuser" email="test@example.com" /></MediaContainer>`,
    { headers: { 'Content-Type': 'text/xml; charset=utf-8' } },
  )
})

export const plexSharedServersHandler = http.get(
  'https://plex.tv/api/servers/:machineId/shared_servers',
  () => {
    return HttpResponse.text(
      `<?xml version="1.0" encoding="UTF-8"?><MediaContainer size="0"></MediaContainer>`,
      { headers: { 'Content-Type': 'text/xml; charset=utf-8' } },
    )
  },
)

export const plexApiHandlers = [
  plexResourcesHandler,
  plexUsersHandler,
  plexSharedServersHandler,
]
