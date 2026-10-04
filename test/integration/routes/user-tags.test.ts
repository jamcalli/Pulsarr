import type { FastifyInstance } from 'fastify'
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

const TAG_DETAILS = [
  { id: 1, label: 'pulsarr-user-alice', seriesIds: [10, 11] },
  { id: 2, label: 'pulsarr-user-bob', seriesIds: [11] },
  { id: 3, label: 'unrelated', seriesIds: [12] },
]

describe('user tag status and prefix lock', () => {
  let app: FastifyInstance
  let originalGetAllInstances: FastifyInstance['sonarrManager']['getAllInstances']
  let originalGetSonarrService: FastifyInstance['sonarrManager']['getSonarrService']
  let getTagDetails: ReturnType<typeof vi.fn>

  beforeAll(async () => {
    app = await build()
    await app.ready()
    originalGetAllInstances = app.sonarrManager.getAllInstances
    originalGetSonarrService = app.sonarrManager.getSonarrService
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await resetDatabase()
    await seedAll(getTestDatabase())
    app.config.authenticationMethod = 'disabled'
    app.config.tagUsersInSonarr = true
    app.config.tagUsersInRadarr = false
    app.config.tagPrefix = 'pulsarr-user'

    getTagDetails = vi.fn().mockResolvedValue(TAG_DETAILS)
    app.sonarrManager.getAllInstances = vi
      .fn()
      .mockResolvedValue([{ id: 1, name: 'Main' }])
    app.sonarrManager.getSonarrService = vi
      .fn()
      .mockReturnValue({ getTagDetails })
  })

  afterEach(() => {
    app.sonarrManager.getAllInstances = originalGetAllInstances
    app.sonarrManager.getSonarrService = originalGetSonarrService
  })

  it('GET /v1/tags/status reports per-instance counts', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/tags/status' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      success: true,
      tagsExist: true,
      instances: [
        {
          type: 'sonarr',
          instanceId: 1,
          name: 'Main',
          tagCount: 2,
          taggedItemCount: 2,
        },
      ],
    })
  })

  it('GET /v1/tags/status reports an unreachable instance as zeros', async () => {
    getTagDetails.mockRejectedValue(new Error('timeout'))

    const res = await app.inject({ method: 'GET', url: '/v1/tags/status' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      tagsExist: false,
      instances: [{ tagCount: 0, taggedItemCount: 0 }],
    })
  })

  it('PUT /v1/config returns 409 when the tag prefix changes while tags exist', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/config',
      payload: { tagPrefix: 'renamed' },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json()).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message:
        'Remove existing user tags before changing the tag prefix or naming source',
    })
    const row = await getTestDatabase()('configs').where({ id: 1 }).first()
    expect(row?.tagPrefix).toBe('pulsarr:user')
  })

  it('PUT /v1/config returns 409 when the naming source changes while tags exist', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/config',
      payload: { tagNamingSource: 'alias' },
    })

    expect(res.statusCode).toBe(409)
  })

  it('PUT /v1/config accepts a prefix change once no user tags remain', async () => {
    getTagDetails.mockResolvedValue([TAG_DETAILS[2]])

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/config',
      payload: { tagPrefix: 'renamed' },
    })

    expect(res.statusCode).toBe(200)
    expect(app.config.tagPrefix).toBe('renamed')
  })
})
