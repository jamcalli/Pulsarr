import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedAll } from '../../helpers/seeds/index.js'

describe('Config nested payloads', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await build()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await resetDatabase()
    await seedAll(getTestDatabase())
    app.config.authenticationMethod = 'disabled'
  })

  it('rejects a partial approvalExpiration and keeps the stored value', async () => {
    await app.db.updateConfig({
      approvalExpiration: {
        enabled: false,
        defaultExpirationHours: 48,
        expirationAction: 'expire',
        autoApproveOnQuotaAvailable: false,
        cleanupExpiredDays: 30,
      },
    })

    const putRes = await app.inject({
      method: 'PUT',
      url: '/v1/config',
      payload: { approvalExpiration: { enabled: true } },
    })
    expect(putRes.statusCode).toBe(400)

    const stored = await app.db.getConfig()
    expect(stored?.approvalExpiration.enabled).toBe(false)
    expect(stored?.approvalExpiration.defaultExpirationHours).toBe(48)
  })

  it('rejects a partial publicContentNotifications and keeps the stored value', async () => {
    const webhook = 'https://discord.com/api/webhooks/123/abc'
    await app.db.updateConfig({
      publicContentNotifications: {
        enabled: false,
        discordWebhookUrls: webhook,
        discordWebhookUrlsMovies: '',
        discordWebhookUrlsShows: '',
        appriseUrls: '',
        appriseUrlsMovies: '',
        appriseUrlsShows: '',
      },
    })

    const putRes = await app.inject({
      method: 'PUT',
      url: '/v1/config',
      payload: { publicContentNotifications: { enabled: true } },
    })
    expect(putRes.statusCode).toBe(400)

    const stored = await app.db.getConfig()
    expect(stored?.publicContentNotifications.enabled).toBe(false)
    expect(stored?.publicContentNotifications.discordWebhookUrls).toBe(webhook)
  })
})
