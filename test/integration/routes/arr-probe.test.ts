import type { FastifyInstance } from 'fastify'
import { HttpResponse, http } from 'msw'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedAll } from '../../helpers/seeds/index.js'
import { server } from '../../setup/msw-setup.js'

const ARRS = [
  { type: 'sonarr', name: 'Sonarr', baseUrl: 'http://test-sonarr:8989' },
  { type: 'radarr', name: 'Radarr', baseUrl: 'http://test-radarr:7878' },
] as const

describe('arr probe routes', () => {
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
    app.caches.clear()
  })

  const probe = (arr: (typeof ARRS)[number]) =>
    app.inject({
      method: 'POST',
      url: `/v1/${arr.type}/probe`,
      payload: { baseUrl: arr.baseUrl, apiKey: 'unsaved-key' },
    })

  it.each(ARRS)('returns the three $name lists', async (arr) => {
    server.use(
      http.get(`${arr.baseUrl}/api/v3/qualityprofile`, () =>
        HttpResponse.json([{ id: 3, name: 'HD' }]),
      ),
      http.get(`${arr.baseUrl}/api/v3/rootfolder`, () =>
        HttpResponse.json([{ id: 1, path: '/media' }]),
      ),
      http.get(`${arr.baseUrl}/api/v3/tag`, () =>
        HttpResponse.json([{ id: 5, label: 'kids' }]),
      ),
    )

    const res = await probe(arr)

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      success: true,
      qualityProfiles: [{ id: 3, name: 'HD' }],
      rootFolders: [{ id: 1, path: '/media' }],
      tags: [{ id: 5, label: 'kids' }],
    })
  })

  it.each(ARRS)(
    'returns a 4xx with the prefix stripped when $name rejects the request',
    async (arr) => {
      server.use(
        http.get(`${arr.baseUrl}/api/v3/rootfolder`, () =>
          HttpResponse.json(
            { message: 'Root folders unavailable' },
            { status: 403 },
          ),
        ),
      )

      const res = await probe(arr)

      expect(res.statusCode).toBe(400)
      expect(res.json().message).toBe('Root folders unavailable')
    },
  )

  it.each(ARRS)('returns a 4xx when $name rejects the API key', async (arr) => {
    server.use(
      http.get(`${arr.baseUrl}/api/v3/qualityprofile`, () =>
        HttpResponse.json({ message: 'Unauthorized' }, { status: 401 }),
      ),
    )

    const res = await probe(arr)

    expect(res.statusCode).toBe(400)
    expect(res.json().message).toBe('Authentication failed. Check API key.')
  })

  it.each(ARRS)('returns a 5xx when $name is unreachable', async (arr) => {
    server.use(
      http.get(`${arr.baseUrl}/api/v3/qualityprofile`, () =>
        HttpResponse.error(),
      ),
    )

    const res = await probe(arr)

    expect(res.statusCode).toBe(500)
  })
})
