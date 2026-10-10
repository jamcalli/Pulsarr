import type { FastifyInstance } from 'fastify'
import { HttpResponse, http } from 'msw'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedAll } from '../../helpers/seeds/index.js'
import { server } from '../../setup/msw-setup.js'

const CALLBACK_FAILURE =
  'Unable to send test message: Connection refused (pulsarr:3003)'

const ARRS = [
  {
    type: 'radarr',
    table: 'radarr_instances',
    baseUrl: 'http://new-radarr:7878',
    payload: {
      name: 'New Radarr',
      baseUrl: 'http://new-radarr:7878',
      apiKey: 'new-radarr-key',
      qualityProfile: '',
      rootFolder: '',
      bypassIgnored: false,
      searchOnAdd: true,
      minimumAvailability: 'released',
      tags: [],
      isDefault: false,
      syncedInstances: [],
    },
  },
  {
    type: 'sonarr',
    table: 'sonarr_instances',
    baseUrl: 'http://new-sonarr:8989',
    payload: {
      name: 'New Sonarr',
      baseUrl: 'http://new-sonarr:8989',
      apiKey: 'new-sonarr-key',
      qualityProfile: '',
      rootFolder: '',
      bypassIgnored: false,
      seasonMonitoring: 'all',
      monitorNewItems: 'all',
      searchOnAdd: true,
      createSeasonFolders: false,
      tags: [],
      isDefault: false,
      syncedInstances: [],
    },
  },
] as const

describe('Arr instance webhook conflict', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await build()
    await app.ready()
    // Webhook registration only runs inline once the server is listening.
    await app.listen({ port: 0, host: '127.0.0.1' })
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

  it.each(ARRS)(
    'returns 409 and keeps no $type row when the arr rejects the webhook',
    async (arr) => {
      server.use(
        http.get(`${arr.baseUrl}/api/v3/notification`, () =>
          HttpResponse.json([]),
        ),
        http.post(`${arr.baseUrl}/api/v3/notification`, () =>
          HttpResponse.json(
            [
              {
                propertyName: 'Url',
                errorMessage: CALLBACK_FAILURE,
                severity: 'error',
              },
            ],
            { status: 400 },
          ),
        ),
      )

      const res = await app.inject({
        method: 'POST',
        url: `/v1/${arr.type}/instances`,
        payload: arr.payload,
      })

      expect(res.statusCode).toBe(409)
      expect(res.json()).toMatchObject({
        statusCode: 409,
        code: 'webhook_callback_failed',
      })
      expect(res.json().message).toContain(CALLBACK_FAILURE)
      expect(
        await getTestDatabase()(arr.table).where('base_url', arr.baseUrl),
      ).toHaveLength(0)
    },
  )
})
