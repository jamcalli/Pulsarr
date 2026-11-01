import type { PublicConfigPatch } from '@root/schemas/config/config-defaults.js'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../../../helpers/app.js'
import { readConfigSettings } from '../../../../helpers/config-settings.js'
import { getTestDatabase, resetDatabase } from '../../../../helpers/database.js'
import { seedConfig } from '../../../../helpers/seeds/config.js'

describe('config database methods', () => {
  let fastify: FastifyInstance

  beforeAll(async () => {
    fastify = await build()
    await fastify.ready()
  })

  afterAll(async () => {
    await fastify.close()
  })

  beforeEach(async () => {
    await resetDatabase()
    await seedConfig(getTestDatabase())
  })

  it('keeps both of two updates with disjoint keys', async () => {
    await fastify.db.updateConfig({ tmdbRegion: 'GB' })
    await fastify.db.updateConfig({ deleteMovie: true })

    const settings = await readConfigSettings(getTestDatabase())
    expect(settings.tmdbRegion).toBe('GB')
    expect(settings.deleteMovie).toBe(true)
    expect(settings.port).toBe(3004)
  })

  it('replaces a nested object whole instead of merging it', async () => {
    await fastify.db.updateConfig({
      approvalExpiration: {
        enabled: true,
        defaultExpirationHours: 24,
        quotaExceededExpirationHours: 12,
      },
    })
    await fastify.db.updateConfig({ approvalExpiration: { enabled: false } })

    const settings = await readConfigSettings(getTestDatabase())
    expect(settings.approvalExpiration).toEqual({ enabled: false })
  })

  it('writes nothing outside the public stored keys', async () => {
    const before = await readConfigSettings(getTestDatabase())
    const patch = {
      cookieSecret: 'public-path-cookie-secret-0123456789',
      webhookSecret: 'public-path-webhook-secret',
      maintainerrWebhookSecret: 'public-path-maintainerr-secret',
      lastNotifiedVersion: '9.9.9',
      dbPassword: 'hunter2',
      notARealSetting: 'x',
    } as PublicConfigPatch

    expect(await fastify.db.updateConfig(patch)).toBe(true)

    expect(await readConfigSettings(getTestDatabase())).toEqual(before)
  })

  it('only bumps updated_at for an empty patch', async () => {
    const knex = getTestDatabase()
    await knex('configs')
      .where({ id: 1 })
      .update({ updated_at: '2020-01-01T00:00:00.000Z' })
    const before = await knex('configs').where({ id: 1 }).first()

    expect(await fastify.db.updateConfig({})).toBe(true)

    const after = await knex('configs').where({ id: 1 }).first()
    expect(after.settings).toBe(before.settings)
    expect(after.updated_at).not.toBe(before.updated_at)
  })

  it('reads and writes the internal keys through their own methods', async () => {
    await fastify.db.setSecret('webhookSecret', 'internal-webhook-secret')
    await fastify.db.setLastNotifiedVersion('2.0.0')

    expect((await fastify.db.getSecrets()).webhookSecret).toBe(
      'internal-webhook-secret',
    )
    expect(await fastify.db.getLastNotifiedVersion()).toBe('2.0.0')
    const config = await fastify.db.getConfig()
    expect(config).not.toHaveProperty('webhookSecret')
    expect(config).not.toHaveProperty('lastNotifiedVersion')
  })
})
