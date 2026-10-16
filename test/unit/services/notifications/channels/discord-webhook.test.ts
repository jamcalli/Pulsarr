import type { DiscordWebhookPayload } from '@root/types/discord.types.js'
import {
  type DiscordWebhookDeps,
  sendNotification,
  testNotification,
} from '@services/notifications/channels/discord-webhook.js'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'
import { server } from '../../../../setup/msw-setup.js'

const WEBHOOK = 'https://discord.com/api/webhooks/123/token'
const ADMIN_WEBHOOK = 'https://discord.com/api/webhooks/999/admin'
const PAYLOAD: DiscordWebhookPayload = { content: 'hello' }

function deps(): DiscordWebhookDeps {
  return { logger: createMockLogger() }
}

function captureWebhook(url: string, status = 204) {
  const payloads: DiscordWebhookPayload[] = []
  server.use(
    http.post(url, async ({ request }) => {
      payloads.push((await request.json()) as DiscordWebhookPayload)
      return new HttpResponse(null, { status })
    }),
  )
  return payloads
}

describe('discord webhook testNotification', () => {
  it('posts one test embed to the given URL only', async () => {
    const sent = captureWebhook(WEBHOOK)
    const admin = captureWebhook(ADMIN_WEBHOOK)

    const result = await testNotification(WEBHOOK, deps())

    expect(result).toEqual({ success: true })
    expect(sent).toHaveLength(1)
    expect(sent[0].embeds).toHaveLength(1)
    expect(admin).toHaveLength(0)
  })

  it('reports a failure when Discord rejects the webhook', async () => {
    captureWebhook(WEBHOOK, 404)

    const result = await testNotification(WEBHOOK, deps())

    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })
})

describe('discord webhook sendNotification', () => {
  it('posts once to each unique URL in the list', async () => {
    const sent = captureWebhook(WEBHOOK)
    const admin = captureWebhook(ADMIN_WEBHOOK)

    const result = await sendNotification(
      `${WEBHOOK}, ${ADMIN_WEBHOOK},${WEBHOOK}`,
      PAYLOAD,
      deps(),
    )

    expect(result).toEqual({ ok: true })
    expect(sent).toEqual([PAYLOAD])
    expect(admin).toEqual([PAYLOAD])
  })

  it('retries a rate-limited post after Retry-After', async () => {
    let attempts = 0
    server.use(
      http.post(WEBHOOK, () => {
        attempts += 1
        return attempts === 1
          ? new HttpResponse(null, {
              status: 429,
              headers: { 'Retry-After': '0.001' },
            })
          : new HttpResponse(null, { status: 204 })
      }),
    )

    const result = await sendNotification(WEBHOOK, PAYLOAD, deps())

    expect(result).toEqual({ ok: true })
    expect(attempts).toBe(2)
  })

  it('gives up after three attempts and reports the status', async () => {
    let attempts = 0
    server.use(
      http.post(WEBHOOK, () => {
        attempts += 1
        return new HttpResponse(null, {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'Retry-After': '0.001' },
        })
      }),
    )

    const result = await sendNotification(WEBHOOK, PAYLOAD, deps())

    expect(result).toEqual({ ok: false, reason: '429 Too Many Requests' })
    expect(attempts).toBe(3)
  })

  it('reports the status Discord rejected the post with', async () => {
    server.use(
      http.post(
        WEBHOOK,
        () => new HttpResponse(null, { status: 404, statusText: 'Not Found' }),
      ),
    )

    const result = await sendNotification(WEBHOOK, PAYLOAD, deps())

    expect(result).toEqual({ ok: false, reason: '404 Not Found' })
  })

  it('reports a missing URL without posting', async () => {
    const result = await sendNotification(' , ', PAYLOAD, deps())

    expect(result.ok).toBe(false)
  })
})
