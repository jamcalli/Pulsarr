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
  // Return all seed users to match test expectations
  return HttpResponse.text(
    `<?xml version="1.0" encoding="UTF-8"?><MediaContainer size="4"><User id="1" title="test-user-primary" username="test-user-primary" email="user1@example.com" /><User id="2" title="test-user-discord-apprise" username="test-user-discord-apprise" email="user2@example.com" /><User id="3" title="test-user-all-notifications" username="test-user-all-notifications" email="user3@example.com" /><User id="4" title="test-user-no-sync" username="test-user-no-sync" email="user4@example.com" /></MediaContainer>`,
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

export const plexPingHandler = http.get('https://plex.tv/api/v2/ping', () => {
  return HttpResponse.json({ status: 'ok' })
})

export const plexUserHandler = http.get('https://plex.tv/api/v2/user', () => {
  return HttpResponse.json({
    id: 'test-user-id',
    username: 'test-user-primary',
    email: 'test@example.com',
  })
})

export const plexWatchlistHandler = http.post(
  'https://discover.provider.plex.tv/rss',
  () => {
    return HttpResponse.json({ items: [] })
  },
)

export const plexCommunityHandler = http.post(
  'https://community.plex.tv/api',
  () => {
    // Return all seed users as friends to prevent them from being deleted
    return HttpResponse.json({
      data: {
        allFriendsV2: [
          {
            userId: '1',
            username: 'test-user-primary',
            email: 'user1@example.com',
          },
          {
            userId: '2',
            username: 'test-user-discord-apprise',
            email: 'user2@example.com',
          },
          {
            userId: '3',
            username: 'test-user-all-notifications',
            email: 'user3@example.com',
          },
          {
            userId: '4',
            username: 'test-user-no-sync',
            email: 'user4@example.com',
          },
        ],
      },
    })
  },
)

// Handler for Plex watchlist RSS feed endpoint
export const plexWatchlistRssHandler = http.get(
  'https://discover.provider.plex.tv/library/sections/watchlist/all',
  () => {
    return HttpResponse.text(
      `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="0" totalSize="0" />`,
      { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
    )
  },
)

// Handler for Sonarr API series endpoint
export const sonarrSeriesHandler = http.get(
  'http://test-sonarr:8989/api/v3/series',
  () => {
    return HttpResponse.json([])
  },
)

// Handler for Radarr API movie endpoint
export const radarrMovieHandler = http.get(
  'http://test-radarr:7878/api/v3/movie',
  () => {
    return HttpResponse.json([])
  },
)

// Handler for Sonarr quality profile endpoint
export const sonarrQualityProfileHandler = http.get(
  'http://test-sonarr:8989/api/v3/qualityprofile',
  () => {
    return HttpResponse.json([])
  },
)

// Handler for Radarr quality profile endpoint
export const radarrQualityProfileHandler = http.get(
  'http://test-radarr:7878/api/v3/qualityprofile',
  () => {
    return HttpResponse.json([])
  },
)

export const plexApiHandlers = [
  plexResourcesHandler,
  plexUsersHandler,
  plexSharedServersHandler,
  plexPingHandler,
  plexUserHandler,
  plexWatchlistHandler,
  plexCommunityHandler,
  plexWatchlistRssHandler,
  sonarrSeriesHandler,
  radarrMovieHandler,
  sonarrQualityProfileHandler,
  radarrQualityProfileHandler,
]
