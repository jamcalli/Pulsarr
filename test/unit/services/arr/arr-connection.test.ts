import { WebhookCallbackError } from '@root/types/arr-connection.types.js'
import {
  checkHealth,
  connectionErrorMessage,
  probe,
  testConnection,
  testWebhookAddress,
} from '@services/arr/arr-connection.js'
import { RADARR, SONARR } from '@services/arr/arr-product.js'
import type { PulsarrAddress } from '@services/arr/arr-webhook.js'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../mocks/logger.js'
import { server } from '../../../setup/msw-setup.js'

const BASE = 'http://arr.test/api/v3'
const CREDENTIALS = { baseUrl: 'arr.test', apiKey: 'key' }
const ADDRESS: PulsarrAddress = {
  appBaseUrl: 'http://localhost',
  port: 3003,
  basePath: '/',
  webhookSecret: 'secret',
}

function serveStatus(appName: string) {
  server.use(
    http.get(`${BASE}/system/status`, () =>
      HttpResponse.json({
        appName,
        version: '4.0.0',
        branch: 'main',
        authentication: 'forms',
      }),
    ),
  )
}

function serveNotifications() {
  server.use(
    http.get(`${BASE}/notification`, () => HttpResponse.json([])),
    http.post(`${BASE}/notification/test`, () => HttpResponse.json({})),
  )
}

function hangingTest() {
  const controllers: AbortController[] = []
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
    const controller = new AbortController()
    controllers.push(controller)
    return controller.signal
  })
  server.use(
    http.post(`${BASE}/notification/test`, () => {
      controllers.at(-1)?.abort(new DOMException('timed out', 'TimeoutError'))
      return new Promise<never>(() => {})
    }),
  )
  return timeout
}

describe.each([SONARR, RADARR])('$appName connection', (product) => {
  const { appName } = product
  const run = (credentials = CREDENTIALS) =>
    testConnection(product, credentials, ADDRESS, createMockLogger())

  it('passes when status, notifications and the callback test pass', async () => {
    serveStatus(appName)
    serveNotifications()

    await expect(run()).resolves.toEqual({
      success: true,
      code: null,
      message: 'Connection successful and webhook API accessible',
    })
  })

  it('requires both credentials', async () => {
    await expect(run({ baseUrl: '', apiKey: 'key' })).resolves.toEqual({
      success: false,
      code: 'unreachable',
      message: 'Base URL and API key are required',
    })
  })

  it('rejects a URL that cannot parse', async () => {
    await expect(run({ baseUrl: 'http://', apiKey: 'key' })).resolves.toEqual({
      success: false,
      code: 'unreachable',
      message: `Invalid URL format. Please check your ${appName} URL.`,
    })
  })

  it('reports auth on a 401 status', async () => {
    server.use(
      http.get(
        `${BASE}/system/status`,
        () => new HttpResponse(null, { status: 401 }),
      ),
    )

    await expect(run()).resolves.toEqual({
      success: false,
      code: 'auth',
      message: 'Authentication failed. Please check your API key.',
    })
  })

  it('reports invalid on a 404 status', async () => {
    server.use(
      http.get(
        `${BASE}/system/status`,
        () => new HttpResponse(null, { status: 404 }),
      ),
    )

    await expect(run()).resolves.toEqual({
      success: false,
      code: 'invalid',
      message: `API endpoint not found. Please check your ${appName} URL.`,
    })
  })

  it("reports the arr's own error text on a failed status", async () => {
    server.use(
      http.get(`${BASE}/system/status`, () =>
        HttpResponse.json({ message: 'Database is locked' }, { status: 500 }),
      ),
    )

    await expect(run()).resolves.toEqual({
      success: false,
      code: 'unreachable',
      message: 'Connection failed (500): Database is locked',
    })
  })

  it('reports a status body that is not JSON', async () => {
    server.use(
      http.get(`${BASE}/system/status`, () => HttpResponse.text('<html>')),
    )

    await expect(run()).resolves.toEqual({
      success: false,
      code: 'invalid',
      message: 'Failed to parse response from server',
    })
  })

  it('reports a status that is not an arr', async () => {
    server.use(
      http.get(`${BASE}/system/status`, () => HttpResponse.json({ ok: true })),
    )

    await expect(run()).resolves.toEqual({
      success: false,
      code: 'invalid',
      message: 'Invalid response from server',
    })
  })

  it('reports the other arr as the wrong application', async () => {
    serveStatus(appName === 'Sonarr' ? 'Radarr' : 'Sonarr')

    await expect(run()).resolves.toEqual({
      success: false,
      code: 'invalid',
      message: `Connected service does not appear to be a valid ${appName} application`,
    })
  })

  it('reports a refused connection as unreachable', async () => {
    server.use(http.get(`${BASE}/system/status`, () => HttpResponse.error()))

    await expect(run()).resolves.toMatchObject({
      success: false,
      code: 'unreachable',
    })
  })

  it('reports a callback rejected by the arr', async () => {
    serveStatus(appName)
    server.use(
      http.get(`${BASE}/notification`, () => HttpResponse.json([])),
      http.post(`${BASE}/notification/test`, () =>
        HttpResponse.json(
          [
            {
              propertyName: 'Url',
              errorMessage: 'Unable to send test message',
            },
          ],
          { status: 400 },
        ),
      ),
    )

    await expect(run()).resolves.toEqual({
      success: false,
      code: 'webhook_callback_failed',
      message: 'Unable to send test message',
    })
  })

  it('times out the callback test as a callback failure', async () => {
    serveStatus(appName)
    server.use(http.get(`${BASE}/notification`, () => HttpResponse.json([])))
    const timeout = hangingTest()
    try {
      await expect(run()).resolves.toEqual({
        success: false,
        code: 'webhook_callback_failed',
        message: `${appName} did not finish calling Pulsarr back in time. Check the webhook address.`,
      })
    } finally {
      timeout.mockRestore()
    }
  })

  it('reads quality profiles, root folders and tags with the credentials', async () => {
    server.use(
      http.get(`${BASE}/qualityprofile`, () =>
        HttpResponse.json([{ id: 3, name: 'HD' }]),
      ),
      http.get(`${BASE}/rootfolder`, () =>
        HttpResponse.json([{ id: 1, path: '/media' }]),
      ),
      http.get(`${BASE}/tag`, () =>
        HttpResponse.json([{ id: 5, label: 'kids' }]),
      ),
    )

    await expect(probe(product, CREDENTIALS)).resolves.toEqual({
      qualityProfiles: [{ id: 3, name: 'HD' }],
      rootFolders: [{ id: 1, path: '/media' }],
      tags: [{ id: 5, label: 'kids' }],
    })
  })

  it('reports a healthy status', async () => {
    serveStatus(appName)

    await expect(checkHealth(product, CREDENTIALS)).resolves.toEqual({
      healthy: true,
    })
  })

  it('reports the status code when unhealthy', async () => {
    server.use(
      http.get(
        `${BASE}/system/status`,
        () => new HttpResponse(null, { status: 503 }),
      ),
    )

    await expect(checkHealth(product, CREDENTIALS)).resolves.toEqual({
      healthy: false,
      error: `${appName} responded with status 503`,
    })
  })

  it('tests a candidate webhook address with the connection test timeout', async () => {
    serveNotifications()
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    try {
      await testWebhookAddress(product, CREDENTIALS, ADDRESS)

      expect(timeout.mock.calls).toEqual([[10000], [10000]])
    } finally {
      timeout.mockRestore()
    }
  })

  it('treats a timed out webhook address test as a callback failure', async () => {
    server.use(http.get(`${BASE}/notification`, () => HttpResponse.json([])))
    const timeout = hangingTest()
    try {
      const result = testWebhookAddress(product, CREDENTIALS, ADDRESS)

      await expect(result).rejects.toBeInstanceOf(WebhookCallbackError)
      await expect(result).rejects.toThrow(
        `${appName} did not finish calling Pulsarr back in time`,
      )
    } finally {
      timeout.mockRestore()
    }
  })
})

describe('connectionErrorMessage', () => {
  it.each([
    ['ECONNREFUSED', 'Connection refused. Please check if Sonarr is running'],
    ['ENOTFOUND', 'Server not found. Please check your Sonarr URL.'],
    ['ETIMEDOUT', 'Connection timeout. Please check your network'],
    ['ECONNRESET', 'Connection was reset.'],
  ])('maps a %s cause code', (code, message) => {
    const error = new TypeError('fetch failed', { cause: { code } })

    expect(connectionErrorMessage(error, 'Sonarr')).toContain(message)
  })

  it('maps a code set on the error itself', () => {
    const error = Object.assign(new TypeError('Unable to connect'), {
      code: 'ECONNREFUSED',
    })

    expect(connectionErrorMessage(error, 'Radarr')).toBe(
      'Connection refused. Please check if Radarr is running and the URL is correct.',
    )
  })

  it('maps a timeout', () => {
    expect(
      connectionErrorMessage(
        new DOMException('timed out', 'TimeoutError'),
        'Radarr',
      ),
    ).toBe(
      'Connection timeout. Please check your Radarr URL and network connection.',
    )
  })

  it('falls back to a network error', () => {
    expect(connectionErrorMessage(new Error('boom'), 'Sonarr')).toBe(
      'Network error. Please check your connection and Sonarr URL.',
    )
  })
})
