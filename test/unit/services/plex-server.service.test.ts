import { CacheRegistry } from '@services/cache-registry.service.js'
import {
  CONNECTION_LIST_TTL_MS,
  PLEX_SHARED_SERVERS_CACHE_TTL_MS,
  PLEX_TV_RETRY_GAP_MS,
  PLEX_USERS_CACHE_TTL_MS,
  PlexServerService,
} from '@services/plex-server.service.js'
import type { FastifyInstance } from 'fastify'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'
import {
  PLEX_IDENTITY,
  plexConnection,
  plexResource,
} from '../../mocks/plex-resources.js'
import { server } from '../../setup/msw-setup.js'

const LOCAL_HTTPS = 'https://192-168-1-10.abc.plex.direct:32400'
const REMOTE_HTTPS = 'https://73-42-118-9.abc.plex.direct:32400'
const FALLBACK = 'http://localhost:32400'

const RESOURCES = [
  plexResource({
    connections: [
      plexConnection({ uri: REMOTE_HTTPS, local: false }),
      plexConnection({ uri: LOCAL_HTTPS }),
    ],
  }),
]

interface PlexState {
  plexTv: 'up' | 'down'
  down: Set<string>
  resourceCalls: number
}

function servePlex(state: PlexState) {
  server.use(
    http.get('https://plex.tv/api/v2/resources', () => {
      state.resourceCalls += 1
      return state.plexTv === 'up'
        ? HttpResponse.json(RESOURCES)
        : HttpResponse.error()
    }),
    ...[LOCAL_HTTPS, REMOTE_HTTPS].flatMap((uri) => [
      http.get(`${uri}/identity`, () =>
        state.down.has(uri)
          ? HttpResponse.error()
          : HttpResponse.json(PLEX_IDENTITY),
      ),
      http.get(`${uri}/`, () =>
        state.down.has(uri)
          ? HttpResponse.error()
          : HttpResponse.json(PLEX_IDENTITY),
      ),
      http.get(`${uri}/library/sections`, () =>
        HttpResponse.json({ MediaContainer: { Directory: [{ key: '1' }] } }),
      ),
    ]),
  )
}

function createService(plexServerUrl = '', caches = new CacheRegistry()) {
  const fastify = {
    caches,
    config: { plexTokens: ['admin-token'], plexServerUrl },
  } as unknown as FastifyInstance
  return new PlexServerService(createMockLogger(), fastify)
}

describe('PlexServerService connection negotiation', () => {
  let state: PlexState

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-14T12:00:00Z'))
    state = { plexTv: 'up', down: new Set(), resourceCalls: 0 }
    servePlex(state)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('selects the best reachable connection and keeps it', async () => {
    const service = createService()

    expect(await service.getPlexServerUrl()).toBe(LOCAL_HTTPS)
    expect(await service.getPlexServerUrl()).toBe(LOCAL_HTTPS)
    expect(state.resourceCalls).toBe(1)
    expect(service.getServerName()).toBe('Basement')
  })

  it('shares one negotiation between concurrent callers', async () => {
    const service = createService()

    const urls = await Promise.all([
      service.getPlexServerUrl(),
      service.getPlexServerUrl(),
      service.getPlexServerUrl(),
    ])

    expect(urls).toEqual([LOCAL_HTTPS, LOCAL_HTTPS, LOCAL_HTTPS])
    expect(state.resourceCalls).toBe(1)
  })

  it('renegotiates a kept pick once the connection list expires', async () => {
    const service = createService()
    expect(await service.getPlexServerUrl()).toBe(LOCAL_HTTPS)

    state.down = new Set([LOCAL_HTTPS])
    vi.advanceTimersByTime(CONNECTION_LIST_TTL_MS)

    expect(await service.getPlexServerUrl()).toBe(REMOTE_HTTPS)
    expect(state.resourceCalls).toBe(2)
  })

  it('drops a negotiation that finishes after the caches were cleared', async () => {
    const service = createService()

    const pending = service.getPlexServerUrl()
    service.clearCaches()
    await pending

    expect(service.getServerName()).toBeNull()
    await service.getPlexServerUrl()
    expect(state.resourceCalls).toBe(2)
  })

  it('reuses a failed server list read for the retry gap, then reads again', async () => {
    let now = 1
    const service = createService('', new CacheRegistry({ now: () => now }))
    server.use(
      http.get(`${LOCAL_HTTPS}/library/all`, () =>
        HttpResponse.json({ MediaContainer: { size: 0 } }),
      ),
    )
    const check = () =>
      service.checkExistenceAcrossServers('abc123', 'movie', true)
    await service.getPlexServerUrl()

    state.plexTv = 'down'
    await check()
    const afterFailure = state.resourceCalls
    state.plexTv = 'up'
    now += PLEX_TV_RETRY_GAP_MS
    await check()
    expect(state.resourceCalls).toBe(afterFailure)

    now += 1
    await check()
    await check()
    expect(state.resourceCalls).toBe(afterFailure + 1)
  })

  it('never caches the fallback when plex.tv cannot be reached', async () => {
    const service = createService()
    state.plexTv = 'down'

    expect(await service.getPlexServerUrl()).toBe(FALLBACK)
    expect(await service.getPlexServerUrl()).toBe(FALLBACK)
    expect(state.resourceCalls).toBe(1)

    state.plexTv = 'up'
    vi.advanceTimersByTime(PLEX_TV_RETRY_GAP_MS)

    expect(await service.getPlexServerUrl()).toBe(LOCAL_HTTPS)
    expect(state.resourceCalls).toBe(2)
  })

  it('never caches a pick when every probe fails', async () => {
    const service = createService()
    state.down = new Set([LOCAL_HTTPS, REMOTE_HTTPS])

    expect(await service.getPlexServerUrl()).toBe(LOCAL_HTTPS)
    expect(await service.getPlexServerUrl()).toBe(LOCAL_HTTPS)
    expect(state.resourceCalls).toBe(1)

    state.down = new Set([LOCAL_HTTPS])
    vi.advanceTimersByTime(PLEX_TV_RETRY_GAP_MS)

    expect(await service.getPlexServerUrl()).toBe(REMOTE_HTTPS)
    expect(state.resourceCalls).toBe(2)
  })

  it('renegotiates after the health check finds the selection unreachable', async () => {
    const service = createService()
    expect(await service.getPlexServerUrl()).toBe(LOCAL_HTTPS)

    state.down = new Set([LOCAL_HTTPS])
    expect((await service.checkPlexServerHealth()).reachable).toBe(true)

    expect(await service.getPlexServerUrl()).toBe(REMOTE_HTTPS)
    expect(state.resourceCalls).toBe(2)
  })

  it('keeps the selection when the health check reaches it', async () => {
    const service = createService()
    expect(await service.getPlexServerUrl()).toBe(LOCAL_HTTPS)

    state.down = new Set([REMOTE_HTTPS])
    await service.checkPlexServerHealth()

    expect(await service.getPlexServerUrl()).toBe(LOCAL_HTTPS)
    expect(state.resourceCalls).toBe(1)
  })

  it('moves to the new best connection on the list refresh', async () => {
    const service = createService()
    expect(await service.getPlexServerUrl()).toBe(LOCAL_HTTPS)

    state.down = new Set([LOCAL_HTTPS])
    vi.advanceTimersByTime(CONNECTION_LIST_TTL_MS)
    await service.getPlexServerConnectionInfo()

    expect(await service.getPlexServerUrl()).toBe(REMOTE_HTTPS)
  })

  it('uses a saved address as is and never probes it away', async () => {
    const saved = 'http://localhost:32400'
    const service = createService(saved)

    expect(await service.getPlexServerUrl()).toBe(saved)
    expect(state.resourceCalls).toBe(0)

    await service.checkPlexServerHealth()
    vi.advanceTimersByTime(CONNECTION_LIST_TTL_MS)
    await service.getPlexServerConnectionInfo()

    expect(await service.getPlexServerUrl()).toBe(saved)
    const [first] = await service.getPlexServerConnectionInfo()
    expect(first?.url).toBe(saved)
  })

  it('tests the address in use', async () => {
    const service = createService()
    state.down = new Set([REMOTE_HTTPS])

    expect(await service.testConnection()).toEqual({
      success: true,
      message: 'Connected to the Plex server.',
      url: LOCAL_HTTPS,
      automatic: true,
    })

    state.down = new Set([LOCAL_HTTPS])
    expect(await service.testConnection()).toEqual({
      success: false,
      message: "Couldn't reach the Plex server at this address.",
      url: LOCAL_HTTPS,
      automatic: true,
    })
    expect(state.resourceCalls).toBe(1)
  })
})

describe('PlexServerService.resolveUserPlexId', () => {
  const OWNER = { id: 1, plex_uuid: 'aaa111' }
  const FRIEND = { id: 2, plex_uuid: 'bbb222' }
  const thumb = (uuid: string) => `https://plex.tv/users/${uuid}/avatar?c=1`

  function createResolver(adminPlexId: number | null = 1001) {
    const fastify = {
      caches: new CacheRegistry(),
      config: { plexTokens: ['admin-token'], plexServerUrl: '' },
      db: { getPrimaryUser: vi.fn(async () => ({ id: OWNER.id })) },
    } as unknown as FastifyInstance
    const service = new PlexServerService(createMockLogger(), fastify)
    if (adminPlexId !== null) service.setAdminPlexId(adminPlexId)
    vi.spyOn(service, 'getPlexUsers').mockResolvedValue([
      {
        id: '2002',
        username: 'friend',
        title: 'Friend Title',
        thumb: thumb(FRIEND.plex_uuid),
      },
      {
        id: 'not-a-number',
        username: 'odd',
        title: 'Odd',
        thumb: thumb('ccc333'),
      },
      {
        id: '3003',
        username: 'owner',
        title: 'Owner',
        thumb: thumb(OWNER.plex_uuid),
      },
    ])
    return service
  }

  it('resolves the primary user to the admin Plex id', async () => {
    expect(await createResolver().resolveUserPlexId(OWNER)).toBe(1001)
  })

  it('falls back to the server user with the primary uuid when the admin id is unknown', async () => {
    expect(await createResolver(null).resolveUserPlexId(OWNER)).toBe(3003)
  })

  it('matches a server user by thumb uuid', async () => {
    expect(await createResolver().resolveUserPlexId(FRIEND)).toBe(2002)
  })

  it('returns null for a user without a plex_uuid', async () => {
    const service = createResolver()

    expect(
      await service.resolveUserPlexId({ id: 9, plex_uuid: null }),
    ).toBeNull()
    expect(await service.resolveUserPlexId({ id: 9 })).toBeNull()
  })

  it('returns null when no server user has the uuid', async () => {
    expect(
      await createResolver().resolveUserPlexId({ id: 9, plex_uuid: 'ddd444' }),
    ).toBeNull()
  })

  it('returns null for a non-numeric Plex id', async () => {
    expect(
      await createResolver().resolveUserPlexId({ id: 9, plex_uuid: 'ccc333' }),
    ).toBeNull()
  })

  it('ignores a server user whose name matches but whose uuid differs', async () => {
    const service = createResolver()
    vi.spyOn(service, 'getPlexUsers').mockResolvedValue([
      { id: '4004', username: 'bob', title: 'bob', thumb: thumb('eee555') },
    ])

    expect(
      await service.resolveUserPlexId({ id: 9, plex_uuid: 'fff666' }),
    ).toBeNull()
  })
})

describe('PlexServerService plex.tv caches', () => {
  const USERS_XML =
    '<MediaContainer><User id="7" username="alice" title="alice"/></MediaContainer>'
  const SHARED_XML =
    '<MediaContainer><SharedServer id="1" username="Alice" email="alice@example.com" userID="7" accessToken="alice-token"/></MediaContainer>'

  let now: number
  let calls: { users: number; shared: number }
  let usersStatus: number
  let usersGate: Promise<void> | undefined

  function createCachedService() {
    servePlex({ plexTv: 'up', down: new Set(), resourceCalls: 0 })
    server.use(
      http.get('https://plex.tv/api/users', async () => {
        calls.users += 1
        await usersGate
        return usersStatus === 200
          ? HttpResponse.text(USERS_XML)
          : new HttpResponse(null, { status: usersStatus })
      }),
      http.get('https://plex.tv/api/servers/machine-1/shared_servers', () => {
        calls.shared += 1
        return HttpResponse.text(SHARED_XML)
      }),
    )
    return createService('', new CacheRegistry({ now: () => now }))
  }

  beforeEach(() => {
    now = 1
    calls = { users: 0, shared: 0 }
    usersStatus = 200
    usersGate = undefined
  })

  it('keeps the users list for its TTL', async () => {
    const service = createCachedService()

    await service.getPlexUsers()
    now += PLEX_USERS_CACHE_TTL_MS
    expect((await service.getPlexUsers()).map((u) => u.id)).toEqual(['7'])
    expect(calls.users).toBe(1)

    now += 1
    await service.getPlexUsers()
    expect(calls.users).toBe(2)
  })

  it('shares one users request between concurrent reads', async () => {
    const service = createCachedService()
    const gate = Promise.withResolvers<void>()
    usersGate = gate.promise

    const reads = Promise.all([service.getPlexUsers(), service.getPlexUsers()])
    gate.resolve()

    const [first, second] = await reads
    expect(first).toEqual(second)
    expect(calls.users).toBe(1)
  })

  it('refetches the users list when asked to skip the cache', async () => {
    const service = createCachedService()

    await service.getPlexUsers()
    await service.getPlexUsers({ skipCache: true })

    expect(calls.users).toBe(2)
  })

  it('never caches a failed users request', async () => {
    const service = createCachedService()
    usersStatus = 500

    expect(await service.getPlexUsers()).toEqual([])
    usersStatus = 200
    expect(await service.getPlexUsers()).toHaveLength(1)
    expect(calls.users).toBe(2)
  })

  it('keeps a user token for the shared server TTL, case-insensitively', async () => {
    const service = createCachedService()

    expect(await service.getUserToken('Alice')).toBe('alice-token')
    now += PLEX_SHARED_SERVERS_CACHE_TTL_MS
    expect(await service.getUserToken('alice')).toBe('alice-token')
    expect(calls.shared).toBe(1)

    now += 1
    await service.getUserToken('alice')
    expect(calls.shared).toBe(2)
  })

  it('never caches a missing token', async () => {
    const service = createCachedService()

    expect(await service.getUserToken('bob')).toBeNull()
    expect(await service.getUserToken('bob')).toBeNull()

    expect(calls.shared).toBe(1)
  })

  it('drops the friend lists and the user token on a friend change', async () => {
    const service = createCachedService()
    await service.getPlexUsers()
    await service.getUserToken('alice')

    service.clearFriendCaches()
    service.clearUserToken('Alice')
    await service.getPlexUsers()
    await service.getUserToken('alice')

    expect(calls).toEqual({ users: 2, shared: 2 })
  })

  it('drops every plex.tv cache on clearCaches', async () => {
    const service = createCachedService()
    await service.getPlexUsers()
    await service.getUserToken('alice')

    service.clearCaches()
    await service.getPlexUsers()
    await service.getUserToken('alice')

    expect(calls).toEqual({ users: 2, shared: 2 })
  })
})
