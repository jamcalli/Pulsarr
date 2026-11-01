import {
  STORED_CONFIG_DEFAULTS,
  STORED_CONFIG_KEYS,
} from '@root/schemas/config/config-defaults.js'
import { DatabaseService } from '@services/database.service.js'
import type { FastifyInstance } from 'fastify'
import type { Knex } from 'knex'
import { afterEach, describe, expect, it } from 'vitest'
import {
  type ConfigFixture,
  type ConfigFixtureValue,
  loadConfigFixtures,
} from '../../../helpers/config-fixtures.js'
import {
  createInMemoryDb,
  migrateThrough,
} from '../../../helpers/migration-db.js'
import { createMockLogger } from '../../../mocks/logger.js'

const REMOVED_KEYS = [
  'dbPath',
  'cookieName',
  'cookieSecured',
  'closeGraceDelay',
  'rateLimitMax',
  'queueProcessDelaySeconds',
  'persistHistoricalTags',
  'cookieSecret',
  'webhookSecret',
  'maintainerrWebhookSecret',
  'lastNotifiedVersion',
  'tagMigration',
]

// A malformed plexSessionMonitoring column used to read as the monitoring defaults and now reads as unset
const ACCEPTED_DIFFERENCES: Record<string, string[]> = {
  'malformed-json': ['plexSessionMonitoring'],
}

const fixtures = loadConfigFixtures()

function isStoredKey(key: string): key is keyof typeof STORED_CONFIG_DEFAULTS {
  return key in STORED_CONFIG_DEFAULTS
}

function expectedAfterMigration(
  name: string,
  expected: ConfigFixture['expected'],
) {
  const skipped = [...REMOVED_KEYS, ...(ACCEPTED_DIFFERENCES[name] ?? [])]
  const result: Record<string, ConfigFixtureValue | object | undefined> = {}
  for (const [key, value] of Object.entries(expected)) {
    if (skipped.includes(key)) continue
    result[key] =
      (value === null || value === '') && isStoredKey(key)
        ? STORED_CONFIG_DEFAULTS[key]
        : value
  }
  return JSON.parse(JSON.stringify(result))
}

async function migratedService(row?: ConfigFixture['row']) {
  const db = createInMemoryDb()
  await migrateThrough(db, '108')
  if (row) await db('configs').insert(row)
  const [, files] = (await db.migrate.up()) as [number, string[]]
  expect(files[0]).toContain('109')
  const fastify = { config: { dbType: 'sqlite' } } as unknown as FastifyInstance
  const service = await DatabaseService.create(createMockLogger(), fastify, db)
  return { db, service }
}

describe('config store golden equivalence', () => {
  let db: Knex | undefined

  afterEach(async () => {
    await db?.destroy()
    db = undefined
  })

  it.each(fixtures)(
    'reads $name the same as before the migration',
    async ({ name, fixture }) => {
      const migrated = await migratedService(fixture.row)
      db = migrated.db

      const actual = await migrated.service.getConfig()

      expect(JSON.parse(JSON.stringify(actual))).toEqual(
        expectedAfterMigration(name, fixture.expected),
      )
    },
  )

  it('reads every string key saved as empty back as its default', async () => {
    const seeded = fixtures.find(({ name }) => name === 'seeded')
    const migrated = await migratedService(seeded?.fixture.row)
    db = migrated.db

    const stringKeys = STORED_CONFIG_KEYS.filter((key) => {
      const fallback = STORED_CONFIG_DEFAULTS[key]
      return typeof fallback === 'string' || fallback === undefined
    })
    expect(stringKeys.length).toBeGreaterThan(20)

    const patch = Object.fromEntries(stringKeys.map((key) => [key, '']))
    expect(await migrated.service.updateConfig(patch)).toBe(true)

    const config = await migrated.service.getConfig()
    const read = Object.fromEntries(
      stringKeys.map((key) => [key, config?.[key]]),
    )
    const defaults = Object.fromEntries(
      stringKeys.map((key) => [key, STORED_CONFIG_DEFAULTS[key]]),
    )
    expect(read).toEqual(defaults)
  })
})
