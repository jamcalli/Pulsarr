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
            user: {
              id: '1',
              username: 'test-user-primary',
              avatar: '',
              displayName: 'Test User Primary',
            },
            createdAt: '2024-01-01T00:00:00Z',
          },
          {
            user: {
              id: '2',
              username: 'test-user-discord-apprise',
              avatar: '',
              displayName: 'Test User Discord',
            },
            createdAt: '2024-01-01T00:00:00Z',
          },
          {
            user: {
              id: '3',
              username: 'test-user-all-notifications',
              avatar: '',
              displayName: 'Test User Notifications',
            },
            createdAt: '2024-01-01T00:00:00Z',
          },
          {
            user: {
              id: '4',
              username: 'test-user-no-sync',
              avatar: '',
              displayName: 'Test User No Sync',
            },
            createdAt: '2024-01-01T00:00:00Z',
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

interface StoredWebhook {
  id: number
  name: string
  url: string
}

interface WebhookBody {
  id?: number
  name: string
  fields: Array<{ name: string; value?: string | number | boolean | object }>
}

interface ArrWebhookMock {
  hooks: StoredWebhook[]
  requests: Array<{ method: string; id?: number; name?: string }>
  nextId: number
}

export const arrWebhookMocks: Record<'sonarr' | 'radarr', ArrWebhookMock> = {
  sonarr: { hooks: [], requests: [], nextId: 173 },
  radarr: { hooks: [], requests: [], nextId: 173 },
}

export function resetArrWebhookMock(
  arr: keyof typeof arrWebhookMocks,
  hooks: StoredWebhook[],
): void {
  Object.assign(arrWebhookMocks[arr], { hooks, requests: [], nextId: 173 })
}

const ARR_WEBHOOK_HOSTS = {
  sonarr: 'http://test-sonarr:8989',
  radarr: 'http://test-radarr:7878',
} as const

function webhookUrl(body: WebhookBody): string {
  const value = body.fields.find((field) => field.name === 'url')?.value
  return typeof value === 'string' ? value : ''
}

function rejectsCallback(url: string): boolean {
  return URL.canParse(url) && new URL(url).hostname === 'unreachable.invalid'
}

const callbackFailure = () =>
  HttpResponse.json(
    [
      {
        propertyName: 'Url',
        errorMessage:
          'Unable to send test message: Name or service not known (unreachable.invalid:80)',
      },
    ],
    { status: 400 },
  )

const arrWebhookHandlers = (['sonarr', 'radarr'] as const).flatMap((arr) => {
  const mock = arrWebhookMocks[arr]
  const base = `${ARR_WEBHOOK_HOSTS[arr]}/api/v3/notification`
  return [
    http.get(base, () =>
      HttpResponse.json(
        mock.hooks.map((hook) => ({
          id: hook.id,
          name: hook.name,
          fields: [{ order: 0, name: 'url', value: hook.url }],
        })),
      ),
    ),
    http.post(base, async ({ request }) => {
      const body = (await request.json()) as WebhookBody
      mock.requests.push({ method: 'POST', name: body.name })
      const url = webhookUrl(body)
      if (rejectsCallback(url)) return callbackFailure()
      const hook = { id: mock.nextId++, name: body.name, url }
      mock.hooks.push(hook)
      return HttpResponse.json(hook, { status: 201 })
    }),
    http.post(`${base}/test`, async ({ request }) => {
      const body = (await request.json()) as WebhookBody
      mock.requests.push({ method: 'TEST', id: body.id, name: body.name })
      if (rejectsCallback(webhookUrl(body))) return callbackFailure()
      if (
        mock.hooks.some(
          (hook) => hook.name === body.name && hook.id !== body.id,
        )
      ) {
        return HttpResponse.json(
          [{ propertyName: 'Name', errorMessage: 'Name should be unique' }],
          { status: 400 },
        )
      }
      return HttpResponse.json({}, { status: 200 })
    }),
    http.put(`${base}/:id`, async ({ request, params }) => {
      const id = Number(params.id)
      const body = (await request.json()) as WebhookBody
      mock.requests.push({ method: 'PUT', id, name: body.name })
      const url = webhookUrl(body)
      if (rejectsCallback(url)) return callbackFailure()
      const hook = mock.hooks.find((stored) => stored.id === id)
      if (!hook) return new HttpResponse(null, { status: 404 })
      hook.name = body.name
      hook.url = url
      return HttpResponse.json(id, { status: 202 })
    }),
    http.delete(`${base}/:id`, ({ params }) => {
      const id = Number(params.id)
      mock.requests.push({ method: 'DELETE', id })
      mock.hooks = mock.hooks.filter((hook) => hook.id !== id)
      return HttpResponse.json({})
    }),
  ]
})

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
  ...arrWebhookHandlers,
]
