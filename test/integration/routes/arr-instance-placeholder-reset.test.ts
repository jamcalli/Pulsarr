import { ARR_API_KEY_PLACEHOLDER } from '@root/schemas/common/arr-placeholder.js'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { insertRollingShow } from '../../helpers/rolling-shows.js'
import { seedAll } from '../../helpers/seeds/index.js'

const ARRS = [
  {
    type: 'radarr',
    table: 'radarr_instances',
    junction: 'watchlist_radarr_instances',
    column: 'radarr_instance_id',
    placeholder: {
      name: 'Default Radarr Instance',
      baseUrl: 'http://localhost:7878',
      apiKey: ARR_API_KEY_PLACEHOLDER,
      qualityProfile: '',
      rootFolder: '',
      bypassIgnored: false,
      searchOnAdd: true,
      minimumAvailability: 'released',
      tags: [],
      isDefault: true,
      syncedInstances: [],
    },
  },
  {
    type: 'sonarr',
    table: 'sonarr_instances',
    junction: 'watchlist_sonarr_instances',
    column: 'sonarr_instance_id',
    placeholder: {
      name: 'Default Sonarr Instance',
      baseUrl: 'http://localhost:8989',
      apiKey: ARR_API_KEY_PLACEHOLDER,
      qualityProfile: '',
      rootFolder: '',
      bypassIgnored: false,
      seasonMonitoring: 'all',
      monitorNewItems: 'all',
      searchOnAdd: true,
      createSeasonFolders: false,
      tags: [],
      isDefault: true,
      syncedInstances: [],
    },
  },
] as const

describe('Arr instance placeholder reset', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await build()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    const knex = getTestDatabase()
    await resetDatabase()
    await seedAll(knex)
    app.config.authenticationMethod = 'disabled'
    app.contentRouter.clearRouterRulesCache()
  })

  const linkInstance = async (arr: (typeof ARRS)[number], id: number) => {
    const knex = getTestDatabase()
    await knex(arr.junction).insert({
      watchlist_id: 1,
      [arr.column]: id,
      status: 'pending',
      is_primary: true,
      syncing: false,
    })
    await knex('watchlist_items')
      .where('id', 1)
      .update({ [arr.column]: id })
    if (arr.type === 'sonarr') {
      await insertRollingShow(knex, {
        show_title: 'Stella',
        monitoring_type: 'firstSeasonRolling',
        sonarr_series_id: 1566,
        sonarr_instance_id: id,
        tvdb_id: '90210',
      })
    }
  }

  const rulesFor = (arr: (typeof ARRS)[number], id: number) =>
    getTestDatabase()('router_rules').where({
      target_type: arr.type,
      target_instance_id: id,
    })

  const serviceFor = (arr: (typeof ARRS)[number], id: number) =>
    arr.type === 'radarr'
      ? app.radarrManager.getRadarrService(id)
      : app.sonarrManager.getSonarrService(id)

  const instanceRows = (arr: (typeof ARRS)[number]) =>
    getTestDatabase()(arr.table).select('*')

  it.each(ARRS)(
    'resets the last real $type instance by replacing its row',
    async (arr) => {
      const knex = getTestDatabase()
      await linkInstance(arr, 1)
      expect(await rulesFor(arr, 1)).not.toHaveLength(0)

      const res = await app.inject({
        method: 'PUT',
        url: `/v1/${arr.type}/instances/1`,
        payload: arr.placeholder,
      })
      expect(res.statusCode).toBe(204)

      const rows = await instanceRows(arr)
      expect(rows).toHaveLength(1)
      expect(rows[0].id).not.toBe(1)
      expect(rows[0].api_key).toBe(ARR_API_KEY_PLACEHOLDER)
      expect(rows[0].name).toBe(arr.placeholder.name)
      expect(Boolean(rows[0].is_default)).toBe(true)
      expect(serviceFor(arr, rows[0].id)).toBeDefined()

      expect(await rulesFor(arr, 1)).toHaveLength(0)
      expect(await knex(arr.junction).where(arr.column, 1)).toHaveLength(0)
      const item = await knex('watchlist_items').where('id', 1).first()
      expect(item[arr.column]).toBeNull()
      expect(
        await knex('rolling_monitored_shows').where('sonarr_instance_id', 1),
      ).toHaveLength(0)
    },
  )

  it.each(ARRS)(
    'resets $type to a fixed placeholder, never values from config',
    async (arr) => {
      const original = { ...app.config }
      Object.assign(app.config, {
        [`${arr.type}BaseUrl`]: 'http://env-arr:1234',
        [`${arr.type}ApiKey`]: 'env-real-key',
        [`${arr.type}RootFolder`]: '/env/root',
        [`${arr.type}Tags`]: ['env-tag'],
      })
      try {
        const res = await app.inject({
          method: 'PUT',
          url: `/v1/${arr.type}/instances/1`,
          payload: arr.placeholder,
        })
        expect(res.statusCode).toBe(204)

        const [row] = await instanceRows(arr)
        expect(row.base_url).toBe(arr.placeholder.baseUrl)
        expect(row.api_key).toBe(ARR_API_KEY_PLACEHOLDER)
        expect(row.root_folder).toBe('')
        expect(JSON.parse(row.tags)).toEqual([])
      } finally {
        Object.assign(app.config, original)
      }
    },
  )

  it.each(ARRS)(
    'replaces a $type placeholder row when real credentials arrive',
    async (arr) => {
      const knex = getTestDatabase()
      await knex(arr.table)
        .where('id', 1)
        .update({ api_key: ARR_API_KEY_PLACEHOLDER })
      await linkInstance(arr, 1)
      expect(await rulesFor(arr, 1)).not.toHaveLength(0)

      const res = await app.inject({
        method: 'PUT',
        url: `/v1/${arr.type}/instances/1`,
        payload: {
          name: `Home ${arr.type}`,
          baseUrl: `http://real-${arr.type}:1234`,
          apiKey: 'real-api-key-1234567890',
        },
      })
      expect(res.statusCode).toBe(204)

      const rows = await instanceRows(arr)
      expect(rows).toHaveLength(1)
      expect(rows[0].id).not.toBe(1)
      expect(rows[0].api_key).toBe('real-api-key-1234567890')
      expect(rows[0].name).toBe(`Home ${arr.type}`)
      expect(Boolean(rows[0].is_default)).toBe(true)
      expect(serviceFor(arr, 1)).toBeUndefined()
      expect(serviceFor(arr, rows[0].id)).toBeDefined()

      expect(await rulesFor(arr, 1)).toHaveLength(0)
      expect(await knex(arr.junction).where(arr.column, 1)).toHaveLength(0)
      const item = await knex('watchlist_items').where('id', 1).first()
      expect(item[arr.column]).toBeNull()
      expect(
        await knex('rolling_monitored_shows').where('sonarr_instance_id', 1),
      ).toHaveLength(0)
    },
  )

  it.each(ARRS)(
    'rejects resetting a $type instance while another real one exists',
    async (arr) => {
      const knex = getTestDatabase()
      await knex(arr.table).insert({
        ...(await knex(arr.table).where('id', 1).first()),
        id: 2,
        name: 'Second',
        base_url: `http://second-${arr.type}:1234`,
        is_default: false,
      })
      const before = await knex(arr.table).orderBy('id')
      const rulesBefore = await rulesFor(arr, 1)

      const res = await app.inject({
        method: 'PUT',
        url: `/v1/${arr.type}/instances/1`,
        payload: arr.placeholder,
      })
      expect(res.statusCode).toBe(400)

      expect(await knex(arr.table).orderBy('id')).toEqual(before)
      expect(await rulesFor(arr, 1)).toEqual(rulesBefore)
    },
  )

  it.each(ARRS)('keeps the id on a real to real $type update', async (arr) => {
    const res = await app.inject({
      method: 'PUT',
      url: `/v1/${arr.type}/instances/1`,
      payload: { name: 'Renamed', apiKey: 'rotated-api-key-1234567890' },
    })
    expect(res.statusCode).toBe(204)

    const rows = await instanceRows(arr)
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(1)
    expect(rows[0].name).toBe('Renamed')
    expect(await rulesFor(arr, 1)).not.toHaveLength(0)
  })
})
