import {
  type PlexMobileNotificationDeps,
  sendPlexMobileNotification,
  sendPlexMobileTestNotification,
} from '@services/notifications/channels/plex-mobile.js'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'
import { server } from '../../../../setup/msw-setup.js'

const PLEX_NOTIFICATIONS = 'https://notifications.plex.tv/api/v1/notifications'

function deps(): PlexMobileNotificationDeps {
  return {
    logger: createMockLogger(),
    plexToken: 'server-token',
    serverMachineId: 'machine-1',
    serverName: 'Basement',
  }
}

interface Captured {
  token: string | null
  raw: string
}

function capture(response: () => Response = () => new HttpResponse(null)) {
  const requests: Captured[] = []
  server.use(
    http.post(PLEX_NOTIFICATIONS, async ({ request }) => {
      requests.push({
        token: request.headers.get('X-Plex-Token'),
        raw: await request.text(),
      })
      return response()
    }),
  )
  return requests
}

describe('sendPlexMobileTestNotification', () => {
  it('sends a library.new push with test movie metadata and no link', async () => {
    const requests = capture()

    const result = await sendPlexMobileTestNotification(42, deps())

    expect(result).toEqual({ success: true })
    expect(requests).toHaveLength(1)
    expect(requests[0].token).toBe('server-token')
    const body = JSON.parse(requests[0].raw)
    expect(body).toEqual({
      group: 'media',
      identifier: 'tv.plex.notification.library.new',
      to: [42],
      data: { provider: { identifier: 'machine-1', title: 'Basement' } },
      metadata: {
        type: 'movie',
        title: expect.any(String),
      },
    })
    expect(body).not.toHaveProperty('uri')
    expect(body).not.toHaveProperty('play')
  })

  it('reports the HTTP status when Plex rejects the push', async () => {
    capture(() => new HttpResponse(null, { status: 401 }))

    const result = await sendPlexMobileTestNotification(42, deps())

    expect(result.success).toBe(false)
    expect(result.statusCode).toBe(401)
    expect(result.error).toBeTruthy()
  })

  it('reports a failure without a status when Plex is unreachable', async () => {
    capture(() => HttpResponse.error())

    const result = await sendPlexMobileTestNotification(42, deps())

    expect(result.success).toBe(false)
    expect(result.statusCode).toBeUndefined()
    expect(result.error).toBeTruthy()
  })
})

describe('sendPlexMobileNotification wire format', () => {
  it('sends the exact movie body real notifications always sent', async () => {
    const requests = capture()

    const sent = await sendPlexMobileNotification(
      {
        type: 'movie',
        title: 'Dune',
        year: '2021',
        ratingKey: '555',
        userIds: [7],
      },
      deps(),
    )

    expect(sent).toEqual({ ok: true })
    expect(requests[0].raw).toBe(
      JSON.stringify({
        group: 'media',
        identifier: 'tv.plex.notification.library.new',
        to: [7],
        data: { provider: { identifier: 'machine-1', title: 'Basement' } },
        metadata: { type: 'movie', title: 'Dune', year: '2021' },
        uri: 'server://machine-1/com.plexapp.plugins.library/library/metadata/555',
        play: false,
      }),
    )
  })

  it('sends the exact season body with its episode count', async () => {
    const requests = capture()

    await sendPlexMobileNotification(
      {
        type: 'season',
        title: 'Severance',
        grandparentTitle: 'Severance',
        seasonNumber: 2,
        episodeCount: 10,
        ratingKey: '900',
        userIds: [7, 8],
      },
      deps(),
    )

    expect(requests[0].raw).toBe(
      JSON.stringify({
        group: 'media',
        identifier: 'tv.plex.notification.library.new',
        to: [7, 8],
        data: {
          provider: { identifier: 'machine-1', title: 'Basement' },
          count: 10,
        },
        metadata: { type: 'show', title: 'Severance' },
        uri: 'server://machine-1/com.plexapp.plugins.library/library/metadata/900',
        play: false,
      }),
    )
  })

  it('leaves the count out of episode bodies', async () => {
    const requests = capture()

    await sendPlexMobileNotification(
      {
        type: 'episode',
        title: 'Pilot',
        grandparentTitle: 'Severance',
        seasonNumber: 1,
        episodeNumber: 1,
        episodeCount: 9,
        ratingKey: '901',
        userIds: [7],
      },
      deps(),
    )

    expect(requests[0].raw).toBe(
      JSON.stringify({
        group: 'media',
        identifier: 'tv.plex.notification.library.new',
        to: [7],
        data: { provider: { identifier: 'machine-1', title: 'Basement' } },
        metadata: {
          type: 'episode',
          title: 'Pilot',
          grandparentTitle: 'Severance',
          index: '1',
          parentIndex: '1',
        },
        uri: 'server://machine-1/com.plexapp.plugins.library/library/metadata/901',
        play: false,
      }),
    )
  })
})
