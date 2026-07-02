import type { FastifyInstance } from 'fastify'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'
import {
  getTestDatabase,
  initializeTestDatabase,
} from '../../helpers/database.js'
import { seedConfig } from '../../helpers/seeds/config.js'

// @fastify/session requires cookie secrets of 32+ chars
const STORED_COOKIE_SECRET = 'stored-cookie-secret-0123456789abcdef'
const STORED_WEBHOOK_SECRET = 'stored-webhook-secret'

// Each test seeds its own configs row and boots the app to simulate a restart
describe('secret persistence across restarts', () => {
  let app: FastifyInstance | undefined

  beforeAll(async () => {
    await initializeTestDatabase()
  })

  beforeEach(async () => {
    const knex = getTestDatabase()
    await knex('configs').del()
  })

  afterEach(async () => {
    await app?.close()
    app = undefined
    delete process.env.webhookSecret
  })

  async function seedStoredSecrets(
    secrets: { cookieSecret?: string; webhookSecret?: string | null } = {},
  ) {
    const knex = getTestDatabase()
    await seedConfig(knex)
    await knex('configs')
      .where({ id: 1 })
      .update({
        cookieSecret: secrets.cookieSecret ?? STORED_COOKIE_SECRET,
        webhookSecret:
          secrets.webhookSecret === undefined
            ? STORED_WEBHOOK_SECRET
            : secrets.webhookSecret,
        // keep boot light - no service initialization
        _isReady: false,
      })
  }

  async function getStoredSecrets() {
    const knex = getTestDatabase()
    const row = await knex('configs').where({ id: 1 }).first()
    return {
      cookieSecret: row?.cookieSecret as string | null,
      webhookSecret: row?.webhookSecret as string | null,
    }
  }

  it('persists generated secrets on fresh install', async () => {
    app = await build()
    await app.ready()

    const stored = await getStoredSecrets()
    expect(stored.cookieSecret).toBeTruthy()
    expect(stored.webhookSecret).toBeTruthy()
    expect(stored.cookieSecret).toBe(app.config.cookieSecret)
    expect(stored.webhookSecret).toBe(app.config.webhookSecret)
  })

  it('reuses persisted secrets on restart', async () => {
    await seedStoredSecrets()

    app = await build()
    await app.ready()

    expect(app.config.cookieSecret).toBe(STORED_COOKIE_SECRET)
    expect(app.config.webhookSecret).toBe(STORED_WEBHOOK_SECRET)
  })

  it('backfills webhookSecret for rows that predate the column', async () => {
    await seedStoredSecrets({ webhookSecret: null })

    app = await build()
    await app.ready()

    const stored = await getStoredSecrets()
    expect(stored.webhookSecret).toBeTruthy()
    expect(stored.webhookSecret).toBe(app.config.webhookSecret)
    expect(app.config.cookieSecret).toBe(STORED_COOKIE_SECRET)
  })

  it('replaces legacy cookieSecret values shorter than 32 chars', async () => {
    await seedStoredSecrets({ cookieSecret: 'short-legacy-secret' })

    app = await build()
    await app.ready()

    const stored = await getStoredSecrets()
    expect(app.config.cookieSecret).not.toBe('short-legacy-secret')
    expect(app.config.cookieSecret.length).toBeGreaterThanOrEqual(32)
    expect(stored.cookieSecret).toBe(app.config.cookieSecret)
    expect(app.config.webhookSecret).toBe(STORED_WEBHOOK_SECRET)
  })

  it('lets .env values override persisted secrets', async () => {
    await seedStoredSecrets()
    const envSecret = 'env-webhook-secret-override'
    process.env.webhookSecret = envSecret

    app = await build()
    await app.ready()

    expect(app.config.webhookSecret).toBe(envSecret)

    const stored = await getStoredSecrets()
    expect(stored.webhookSecret).toBe(STORED_WEBHOOK_SECRET)
  })
})
