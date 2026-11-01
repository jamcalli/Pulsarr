import {
  INTERNAL_CONFIG_KEYS,
  STORED_CONFIG_KEYS,
} from '@root/schemas/config/config-defaults.js'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'
import { readConfigSettings } from '../../helpers/config-settings.js'
import {
  getTestDatabase,
  initializeTestDatabase,
  resetDatabase,
} from '../../helpers/database.js'

const DEAD_KEYS = [
  'dbPath',
  'cookieName',
  'cookieSecured',
  'closeGraceDelay',
  'rateLimitMax',
  'queueProcessDelaySeconds',
  'persistHistoricalTags',
]

describe('config on first boot', { timeout: 30_000 }, () => {
  let app: FastifyInstance | undefined

  beforeAll(async () => {
    await initializeTestDatabase()
  })

  beforeEach(async () => {
    await resetDatabase()
  })

  afterEach(async () => {
    await app?.close()
    app = undefined
  })

  async function boot(): Promise<FastifyInstance> {
    app = await build()
    await app.ready()
    return app
  }

  it('creates one row holding every env value as a document', async () => {
    const booted = await boot()

    const rows = await getTestDatabase()('configs').select('id')
    expect(rows).toEqual([{ id: 1 }])

    const settings = await readConfigSettings(getTestDatabase())
    const allowed = new Set<string>([
      ...STORED_CONFIG_KEYS,
      ...INTERNAL_CONFIG_KEYS,
    ])
    expect(Object.keys(settings).filter((key) => !allowed.has(key))).toEqual([])
    for (const key of DEAD_KEYS) expect(settings).not.toHaveProperty(key)

    expect(settings._isReady).toBe(false)
    expect(settings.cookieSecret).toBe(booted.config.cookieSecret)
    expect(settings.webhookSecret).toBe(booted.config.webhookSecret)
    expect(settings.maintainerrWebhookSecret).toBe(
      booted.config.maintainerrWebhookSecret,
    )

    for (const key of STORED_CONFIG_KEYS) {
      if (key === '_isReady') continue
      const envValue = booted.config[key]
      if (envValue === undefined) continue
      expect(settings[key], key).toEqual(envValue)
    }
  })

  it('reads the stored document back through the API', async () => {
    const booted = await boot()
    booted.config.authenticationMethod = 'disabled'

    const res = await booted.inject({ method: 'GET', url: '/v1/config' })
    expect(res.statusCode).toBe(200)
    const { config } = res.json()
    const stored = await booted.db.getConfig()
    expect(config.tmdbRegion).toBe(stored?.tmdbRegion)
    expect(config.quotaSettings).toEqual(stored?.quotaSettings)
    expect(config.plexLabelSync).toEqual(stored?.plexLabelSync)
    expect(config).not.toHaveProperty('cookieSecret')
  })

  it('keeps the document unchanged on a second boot', async () => {
    await boot()
    const first = await readConfigSettings(getTestDatabase())
    await app?.close()
    app = undefined
    await getTestDatabase()('sonarr_instances').del()
    await getTestDatabase()('radarr_instances').del()

    await boot()
    const second = await readConfigSettings(getTestDatabase())
    expect(second).toEqual(first)
  })
})
