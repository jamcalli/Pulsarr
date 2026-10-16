import type { AppriseMessage } from '@root/types/notification.types.js'
import {
  type AppriseDeps,
  sendNotification,
  testNotification,
} from '@services/notifications/channels/apprise.js'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'
import { server } from '../../../../setup/msw-setup.js'

const APPRISE_BASE = 'http://apprise.test:8000'

function deps(config: Partial<AppriseDeps['config']> = {}): AppriseDeps {
  return {
    logger: createMockLogger(),
    config: { appriseUrl: APPRISE_BASE, enableApprise: true, ...config },
  }
}

interface NotifyBody {
  urls: string
  body: string
  format: string
  attachment?: string
}

function captureNotify(status = 200) {
  const bodies: NotifyBody[] = []
  server.use(
    http.post(`${APPRISE_BASE}/notify`, async ({ request }) => {
      bodies.push((await request.json()) as NotifyBody)
      return new HttpResponse(null, { status })
    }),
  )
  return bodies
}

describe('apprise testNotification', () => {
  it('sends the test through the Apprise server to the given URL', async () => {
    const bodies = captureNotify()

    const result = await testNotification('tgram://bot/chat', deps())

    expect(result).toEqual({ success: true })
    expect(bodies).toHaveLength(1)
    expect(bodies[0].urls).toBe('tgram://bot/chat')
  })

  it('resolves a plain email against the email sender', async () => {
    const bodies = captureNotify()

    const result = await testNotification(
      'user@example.com',
      deps({ appriseEmailSender: 'mailtos://sender:pw@example.com' }),
    )

    expect(result.success).toBe(true)
    expect(bodies[0].urls).toBe(
      'mailtos://sender:pw@example.com?to=user%40example.com',
    )
  })

  it('fails without sending when Apprise has no server URL', async () => {
    const bodies = captureNotify()

    const result = await testNotification(
      'tgram://bot/chat',
      deps({ appriseUrl: '' }),
    )

    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
    expect(bodies).toHaveLength(0)
  })

  it('fails without sending when Apprise is not enabled', async () => {
    const bodies = captureNotify()

    const result = await testNotification(
      'tgram://bot/chat',
      deps({ enableApprise: false }),
    )

    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
    expect(bodies).toHaveLength(0)
  })

  it('fails without sending when the URL cannot be resolved', async () => {
    const bodies = captureNotify()

    const result = await testNotification('user@example.com', deps())

    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
    expect(bodies).toHaveLength(0)
  })

  it('reports a failure when the Apprise server rejects the send', async () => {
    captureNotify(500)

    const result = await testNotification('tgram://bot/chat', deps())

    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
    expect(result.statusCode).toBeUndefined()
  })
})

describe('apprise sendNotification', () => {
  const message: AppriseMessage = {
    title: 'Nosferatu',
    body: 'plain body',
    bodyHtml: '<p>html body</p>',
    type: 'info',
    attachment: 'https://image.test/poster.jpg',
  }

  it('batches targets by format and drops the attachment for email', async () => {
    const bodies = captureNotify()
    const schemaFormatCache = new Map([
      ['tgram', 'html' as const],
      ['mailto', 'html' as const],
      ['pover', 'text' as const],
    ])

    const result = await sendNotification(
      'tgram://bot/chat, mailto://user:pw@example.com, pover://user@token',
      message,
      { ...deps(), schemaFormatCache },
    )

    expect(result).toEqual({ ok: true })
    expect(
      bodies
        .map(({ urls, format, body, attachment }) => ({
          urls,
          format,
          body,
          attachment,
        }))
        .sort((a, b) => a.urls.localeCompare(b.urls)),
    ).toEqual([
      {
        urls: 'mailto://user:pw@example.com',
        format: 'html',
        body: '<p>html body</p>',
        attachment: undefined,
      },
      {
        urls: 'tgram://bot/chat,pover://user@token',
        format: 'text',
        body: 'plain body',
        attachment: 'https://image.test/poster.jpg',
      },
    ])
  })

  it('sends one HTML batch with the attachment when no formats are cached', async () => {
    const bodies = captureNotify()

    await sendNotification(
      'tgram://bot/chat,pover://user@token',
      message,
      deps(),
    )

    expect(bodies).toEqual([
      expect.objectContaining({
        urls: 'tgram://bot/chat,pover://user@token',
        format: 'html',
        attachment: 'https://image.test/poster.jpg',
      }),
    ])
  })

  it('reports the failed URL details Apprise returns with a 424', async () => {
    server.use(
      http.post(`${APPRISE_BASE}/notify`, () =>
        HttpResponse.json(
          {
            error: 'One or more notification could not be sent.',
            details: [
              ['INFO', '2026-10-16T10:00:00', 'Loaded 1 entries'],
              ['WARNING', '2026-10-16T10:00:01', 'Failed to send Telegram'],
              ['ERROR', '2026-10-16T10:00:01', 'Unauthorized'],
            ],
          },
          { status: 424 },
        ),
      ),
    )

    const result = await sendNotification('tgram://bot/chat', message, deps())

    expect(result).toEqual({
      ok: false,
      reason: '424 Failed to send Telegram; Unauthorized',
    })
  })

  it('falls back to the status text when the body has no details', async () => {
    server.use(
      http.post(
        `${APPRISE_BASE}/notify`,
        () =>
          new HttpResponse('oops', {
            status: 400,
            statusText: 'Bad Request',
          }),
      ),
    )

    const result = await sendNotification('tgram://bot/chat', message, deps())

    expect(result).toEqual({ ok: false, reason: '400 Bad Request' })
  })

  it('reports a disabled Apprise without sending', async () => {
    const bodies = captureNotify()

    const result = await sendNotification('tgram://bot/chat', message, {
      ...deps(),
      config: { appriseUrl: APPRISE_BASE, enableApprise: false },
    })

    expect(result.ok).toBe(false)
    expect(bodies).toHaveLength(0)
  })
})
