import { RunWatchlistDiagnosticsResponseSchema } from '@schemas/watchlist-diagnostics/watchlist-diagnostics.schema.js'
import { PlexRateLimiter } from '@services/plex-watchlist/api/rate-limiter.js'
import type { FastifyInstance } from 'fastify'
import type { Knex } from 'knex'
import { HttpResponse, http } from 'msw'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedAll } from '../../helpers/seeds/index.js'
import { server } from '../../setup/msw-setup.js'

const DISCOVER_URL =
  'https://discover.provider.plex.tv/library/sections/watchlist/all'
const GRAPHQL_URL = 'https://community.plex.tv/api'
const PLEX_TOKEN = 'diagnostics-test-token'

// Seeded primary user (id 1) watchlist keys
const NIGHT_OF_THE_LIVING_DEAD = '5d77683585719b001f3a3946'
const NOSFERATU = '5d776c8cad5437001f7c17f0'

async function snapshotDatabase(knex: Knex) {
  const tables = await knex('sqlite_master')
    .select<{ name: string }[]>('name')
    .where('type', 'table')
    .whereNot('name', 'like', 'sqlite_%')
    .orderBy('name')
  const snapshot: Record<string, unknown[]> = {}
  for (const { name } of tables) {
    snapshot[name] = await knex(name).select('*')
  }
  return snapshot
}

/** Spies on every method of a service so a test can prove none ran. */
function spyOnAllMethods(target: object): MockInstance[] {
  const spies: MockInstance[] = []
  const seen = new Set<string>()
  let proto: object | null = target
  while (proto && proto !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor' || seen.has(name)) continue
      const descriptor = Object.getOwnPropertyDescriptor(proto, name)
      if (!descriptor || typeof descriptor.value !== 'function') continue
      seen.add(name)
      spies.push(
        vi.spyOn(
          target as Record<string, (...args: unknown[]) => unknown>,
          name,
        ),
      )
    }
    proto = Object.getPrototypeOf(proto)
  }
  return spies
}

describe('POST /v1/watchlist-diagnostics/users/:userId', () => {
  let app: FastifyInstance
  let plexCalls: number
  // Advances across tests so each starts past the previous one's cooldown
  let clock = Date.now()

  beforeAll(async () => {
    app = await build()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    // Each test moves the clock past the per-user cooldown of the last one
    clock += 10 * 60_000
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(clock)

    await resetDatabase()
    const knex = getTestDatabase()
    await seedAll(knex)
    await knex('users').where('id', 2).update({ plex_uuid: 'friend-uuid-2' })
    app.config.authenticationMethod = 'disabled'
    app.config.plexTokens = [PLEX_TOKEN]
    PlexRateLimiter.getInstance().reset()

    plexCalls = 0
    server.use(
      http.get(DISCOVER_URL, () => {
        plexCalls++
        return HttpResponse.json({
          MediaContainer: {
            totalSize: 2,
            Metadata: [
              {
                key: `/library/metadata/${NIGHT_OF_THE_LIVING_DEAD}`,
                title: 'Night of the Living Dead',
                type: 'movie',
              },
              {
                key: '/library/metadata/brand-new-item',
                title: 'Brand New Movie',
                type: 'movie',
              },
            ],
          },
        })
      }),
      http.post(GRAPHQL_URL, () => {
        plexCalls++
        return HttpResponse.json({
          data: {
            userV2: {
              watchlist: {
                nodes: [
                  { id: 'friend-item', title: 'Friend Pick', type: 'SHOW' },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        })
      }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('returns a diagnostics report matching the response schema', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/watchlist-diagnostics/users/1',
    })

    expect(res.statusCode).toBe(200)
    const body = RunWatchlistDiagnosticsResponseSchema.parse(res.json())
    const { diagnostics } = body

    expect(diagnostics.user).toMatchObject({
      id: 1,
      name: 'test-user-primary',
      isPrimary: true,
    })
    expect(diagnostics.live).toMatchObject({
      source: 'self',
      itemCount: 2,
      truncated: false,
    })

    const byKey = new Map(diagnostics.items.map((item) => [item.key, item]))
    expect(byKey.get('brand-new-item')).toMatchObject({
      presence: 'plex_only',
      state: 'not_seen_yet',
    })
    expect(byKey.get(NIGHT_OF_THE_LIVING_DEAD)?.presence).toBe('both')
    expect(byKey.get(NOSFERATU)).toMatchObject({
      presence: 'pulsarr_only',
      state: 'removed_from_plex',
    })
    expect(diagnostics.summary.plexOnly).toBe(1)
    expect(plexCalls).toBe(1)
  })

  it("fetches a friend's watchlist through GraphQL", async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/watchlist-diagnostics/users/2',
    })

    expect(res.statusCode).toBe(200)
    const { diagnostics } = res.json()
    expect(diagnostics.live.source).toBe('friend')
    expect(
      diagnostics.items.find(
        (item: { key: string }) => item.key === 'friend-item',
      ),
    ).toMatchObject({ presence: 'plex_only', type: 'show' })
  })

  it('never writes to the database or touches arr, routing or sync services', async () => {
    const knex = getTestDatabase()
    const before = await snapshotDatabase(knex)
    const spies = [
      ...spyOnAllMethods(app.radarrManager),
      ...spyOnAllMethods(app.sonarrManager),
      ...spyOnAllMethods(app.contentRouter),
      ...spyOnAllMethods(app.plexWatchlist),
      ...spyOnAllMethods(app.notifications),
    ]
    expect(spies.length).toBeGreaterThan(10)

    const res = await app.inject({
      method: 'POST',
      url: '/v1/watchlist-diagnostics/users/1',
    })
    expect(res.statusCode).toBe(200)

    const after = await snapshotDatabase(knex)
    expect(after).toEqual(before)
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled()
    }
  })

  it('does not leak the Plex token in the response', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/watchlist-diagnostics/users/2',
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain(PLEX_TOKEN)
    expect(res.body).not.toContain('friend-uuid-2')
    expect(res.body).not.toContain('@example.com')
  })

  it('rate-limits repeat runs for the same user with Retry-After', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/v1/watchlist-diagnostics/users/1',
    })
    expect(first.statusCode).toBe(200)

    const second = await app.inject({
      method: 'POST',
      url: '/v1/watchlist-diagnostics/users/1',
    })
    expect(second.statusCode).toBe(429)
    expect(Number(second.headers['retry-after'])).toBeGreaterThan(0)
    expect(second.json().message).toContain('ran recently')
    expect(plexCalls).toBe(1)

    clock += 61_000
    vi.setSystemTime(clock)
    const third = await app.inject({
      method: 'POST',
      url: '/v1/watchlist-diagnostics/users/1',
    })
    expect(third.statusCode).toBe(200)
    expect(plexCalls).toBe(2)
  })

  it('returns 404 for an unknown user without calling Plex', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/watchlist-diagnostics/users/9999',
    })
    expect(res.statusCode).toBe(404)
    expect(plexCalls).toBe(0)
  })

  it('returns 400 for an invalid user id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/watchlist-diagnostics/users/abc',
    })
    expect(res.statusCode).toBe(400)
    expect(plexCalls).toBe(0)
  })

  it('returns 502 when Plex fails, without falling back to stored data', async () => {
    server.use(
      http.get(DISCOVER_URL, () => {
        plexCalls++
        return new HttpResponse(null, { status: 500 })
      }),
    )
    const res = await app.inject({
      method: 'POST',
      url: '/v1/watchlist-diagnostics/users/1',
    })
    expect(res.statusCode).toBe(502)
    expect(res.json()).not.toHaveProperty('diagnostics')
    expect(plexCalls).toBeGreaterThan(0)
  })

  it('rejects GET so the run is never prefetched or cached', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/watchlist-diagnostics/users/1',
    })
    expect(res.statusCode).toBe(404)
    expect(plexCalls).toBe(0)
  })

  describe('authentication', () => {
    it('rejects an unauthenticated request when auth is required', async () => {
      app.config.authenticationMethod = 'required'
      const res = await app.inject({
        method: 'POST',
        url: '/v1/watchlist-diagnostics/users/1',
      })
      expect(res.statusCode).toBe(401)
      expect(plexCalls).toBe(0)
    })

    it('rejects an invalid API key even when auth is disabled', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/watchlist-diagnostics/users/1',
        headers: { 'x-api-key': 'not-a-real-key' },
      })
      expect(res.statusCode).toBe(401)
      expect(plexCalls).toBe(0)
    })
  })
})
