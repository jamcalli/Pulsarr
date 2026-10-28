import { ArrClient } from '@services/arr/arr-client.js'
import {
  configurePlexNotification,
  removePlexNotification,
} from '@services/arr/arr-plex-notification.js'
import { RADARR, SONARR } from '@services/arr/arr-product.js'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { createMockLogger } from '../../../mocks/logger.js'
import { server } from '../../../setup/msw-setup.js'

const NOTIFICATION_URL = 'http://arr.test/api/v3/notification'
const SETTINGS = {
  plexToken: 'token',
  plexHost: 'plex.local',
  plexPort: 32400,
  useSsl: false,
}

type Request = { method: string; id?: number; body?: object }

function serveNotifications(
  notifications: Array<{ id: number; implementation: string }>,
  writeStatus = 201,
): Request[] {
  const requests: Request[] = []
  const reply = () =>
    writeStatus < 400
      ? HttpResponse.json({ id: 1 }, { status: writeStatus })
      : HttpResponse.json(
          [{ propertyName: 'Host', errorMessage: 'Unable to connect' }],
          { status: writeStatus },
        )
  server.use(
    http.get(NOTIFICATION_URL, () => HttpResponse.json(notifications)),
    http.post(NOTIFICATION_URL, async ({ request }) => {
      requests.push({ method: 'POST', body: (await request.json()) as object })
      return reply()
    }),
    http.put(`${NOTIFICATION_URL}/:id`, async ({ request, params }) => {
      requests.push({
        method: 'PUT',
        id: Number(params.id),
        body: (await request.json()) as object,
      })
      return reply()
    }),
    http.delete(`${NOTIFICATION_URL}/:id`, ({ params }) => {
      requests.push({ method: 'DELETE', id: Number(params.id) })
      return new HttpResponse(null, { status: 200 })
    }),
  )
  return requests
}

describe.each([
  { product: SONARR, deleteFlag: 'onSeriesDelete' },
  { product: RADARR, deleteFlag: 'onMovieDelete' },
])('$product.appName Plex notification', ({ product, deleteFlag }) => {
  const client = new ArrClient({
    appName: product.appName,
    baseUrl: 'http://arr.test',
    apiKey: 'key',
    timeoutMs: 1000,
  })
  const log = createMockLogger()

  it("creates the notification with the product's flags", async () => {
    const requests = serveNotifications([{ id: 4, implementation: 'Webhook' }])

    await configurePlexNotification(client, product, SETTINGS, log)

    expect(requests.map((r) => r.method)).toEqual(['POST'])
    expect(requests[0].body).toMatchObject({
      implementation: 'PlexServer',
      [deleteFlag]: true,
      infoLink: product.plexNotification.infoLink,
      fields: expect.arrayContaining([{ name: 'host', value: 'plex.local' }]),
    })
  })

  it('updates an existing notification in place', async () => {
    const requests = serveNotifications([
      { id: 9, implementation: 'PlexServer' },
    ])

    await configurePlexNotification(client, product, SETTINGS, log)

    expect(requests.map((r) => [r.method, r.id])).toEqual([['PUT', 9]])
    expect(requests[0].body).toMatchObject({ id: 9 })
  })

  it('keeps the existing notification when the arr rejects the new settings', async () => {
    const requests = serveNotifications(
      [{ id: 9, implementation: 'PlexServer' }],
      400,
    )

    await expect(
      configurePlexNotification(client, product, SETTINGS, log),
    ).rejects.toThrow('Unable to connect')
    expect(requests.map((r) => r.method)).toEqual(['PUT'])
  })

  it('removes the Plex notification only', async () => {
    const requests = serveNotifications([
      { id: 4, implementation: 'Webhook' },
      { id: 9, implementation: 'PlexServer' },
    ])

    await removePlexNotification(client, product, log)

    expect(requests).toEqual([{ method: 'DELETE', id: 9 }])
  })

  it('does nothing when there is no Plex notification', async () => {
    const requests = serveNotifications([])

    await removePlexNotification(client, product, log)

    expect(requests).toEqual([])
  })
})
