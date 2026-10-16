import type { FastifyInstance } from 'fastify'
import { HttpResponse, http } from 'msw'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedAll } from '../../helpers/seeds/index.js'
import { server } from '../../setup/msw-setup.js'

const APPRISE_BASE = 'http://apprise.test:8000'
const WEBHOOK_OK = 'https://discord.com/api/webhooks/1/ok'
const WEBHOOK_BAD = 'https://discord.com/api/webhooks/2/bad'
const PLEX_NOTIFICATIONS = 'https://notifications.plex.tv/api/v1/notifications'
const PRIMARY_USER_ID = 1
const APPRISE_DISCORD_USER_ID = 2
const NO_CHANNELS_USER_ID = 4

describe('POST /v1/notifications/test', () => {
  let app: FastifyInstance
  let appriseTargets: string[]
  let plexRecipients: number[][]

  beforeAll(async () => {
    app = await build()
    await app.ready()
    await app.notifications.apprise.whenReady()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await resetDatabase()
    await seedAll(getTestDatabase())
    app.config.authenticationMethod = 'disabled'
    app.config.appriseUrl = APPRISE_BASE
    app.config.enableApprise = true
    app.config.systemAppriseUrl = ''
    app.config.discordWebhookUrl = ''
    app.config.publicContentNotifications = { enabled: false }
    app.config.plexTokens = ['test_plex_token_1234567890']
    app.config.plexMobileEnabled = true
    app.plexServerService.setHasPlexPass(true)
    app.plexServerService.setAdminPlexId(1001)
    vi.spyOn(app.plexServerService, 'getServerMachineId').mockReturnValue(
      'machine-1',
    )

    appriseTargets = []
    plexRecipients = []
    server.use(
      http.post(`${APPRISE_BASE}/notify`, async ({ request }) => {
        const body = (await request.json()) as { urls: string }
        appriseTargets.push(body.urls)
        return new HttpResponse(null, { status: 200 })
      }),
      http.post(WEBHOOK_OK, () => new HttpResponse(null, { status: 204 })),
      http.post(WEBHOOK_BAD, () => new HttpResponse(null, { status: 404 })),
      http.post(PLEX_NOTIFICATIONS, async ({ request }) => {
        const body = (await request.json()) as { to: number[] }
        plexRecipients.push(body.to)
        return new HttpResponse(null, { status: 200 })
      }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function post(path: string, payload: Record<string, string>) {
    return app.inject({
      method: 'POST',
      url: `/v1/notifications/test/${path}`,
      payload,
    })
  }

  describe('apprise', () => {
    it('sends to an unsaved Apprise URL', async () => {
      const res = await post('apprise', { url: 'tgram://bot/chat' })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ success: true })
      expect(res.json().responseTime).toEqual(expect.any(Number))
      expect(appriseTargets).toEqual(['tgram://bot/chat'])
    })

    it('reports a failed result when Apprise is not enabled', async () => {
      app.config.enableApprise = false

      const res = await post('apprise', { url: 'tgram://bot/chat' })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(false)
      expect(appriseTargets).toEqual([])
    })

    it('rejects an empty URL', async () => {
      const res = await post('apprise', { url: '  ' })

      expect(res.statusCode).toBe(400)
    })
  })

  describe('discord-webhook', () => {
    it('posts to an unsaved webhook URL', async () => {
      const res = await post('discord-webhook', { url: WEBHOOK_OK })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
    })

    it('reports a failed result when Discord rejects the webhook', async () => {
      const res = await post('discord-webhook', { url: WEBHOOK_BAD })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(false)
    })

    it.each([
      'http://discord.com/api/webhooks/1/x',
      'https://example.com/api/webhooks/1/x',
      'https://discord.com/channels/1',
    ])('rejects %s', async (url) => {
      const res = await post('discord-webhook', { url })

      expect(res.statusCode).toBe(400)
    })
  })

  describe('discord-dm', () => {
    it('reports a failed result while the bot is not running', async () => {
      const res = await post('discord-dm', { discordId: '123456789012345678' })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(false)
    })

    it('rejects a non-numeric Discord ID', async () => {
      const res = await post('discord-dm', { discordId: 'alice#1234' })

      expect(res.statusCode).toBe(400)
    })
  })

  describe('system', () => {
    it('tests the saved system Apprise URL', async () => {
      app.config.systemAppriseUrl = 'tgram://system/chat'

      const res = await post('system', { target: 'systemApprise' })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
      expect(appriseTargets).toEqual(['tgram://system/chat'])
    })

    it('folds a comma-separated setting into one failed result', async () => {
      app.config.publicContentNotifications = {
        enabled: true,
        discordWebhookUrls: `${WEBHOOK_OK},${WEBHOOK_BAD}`,
      }

      const res = await post('system', { target: 'publicDiscord' })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(false)
      expect(res.json().error).toContain(WEBHOOK_BAD)
      expect(res.json().error).not.toContain(WEBHOOK_OK)
    })

    it('returns 400 when the setting is empty', async () => {
      const res = await post('system', { target: 'adminWebhook' })

      expect(res.statusCode).toBe(400)
    })

    it('rejects an unknown target', async () => {
      const res = await post('system', { target: 'everything' })

      expect(res.statusCode).toBe(400)
    })
  })

  describe('users', () => {
    it('tests the saved user Apprise URL', async () => {
      const res = await post(`users/${APPRISE_DISCORD_USER_ID}`, {
        channel: 'apprise',
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
      expect(appriseTargets).toEqual(['mailto://user2@example.com'])
    })

    it('sends a Plex mobile test to the owner', async () => {
      const res = await post(`users/${PRIMARY_USER_ID}`, {
        channel: 'plex-mobile',
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
      expect(plexRecipients).toEqual([[1001]])
    })

    it('sends a Plex mobile test to a friend', async () => {
      const res = await post(`users/${APPRISE_DISCORD_USER_ID}`, {
        channel: 'plex-mobile',
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
      expect(plexRecipients).toEqual([[2]])
    })

    it('reports a failed Discord DM while the bot is not running', async () => {
      const res = await post(`users/${APPRISE_DISCORD_USER_ID}`, {
        channel: 'discord-dm',
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(false)
    })

    it.each(['apprise', 'discord-dm'])(
      'returns 400 when the user has no %s set up',
      async (channel) => {
        const res = await post(`users/${NO_CHANNELS_USER_ID}`, { channel })

        expect(res.statusCode).toBe(400)
      },
    )

    it('returns 404 for an unknown user', async () => {
      const res = await post('users/999', { channel: 'apprise' })

      expect(res.statusCode).toBe(404)
    })

    it('rejects an unknown channel', async () => {
      const res = await post(`users/${PRIMARY_USER_ID}`, { channel: 'pager' })

      expect(res.statusCode).toBe(400)
    })
  })
})
