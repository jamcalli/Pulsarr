import type { PlexExistenceScope } from '@root/types/config.types.js'
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

function createService(
  plexServerUrl = '',
  caches = new CacheRegistry(),
  plexExistenceScope: PlexExistenceScope = 'owned-and-shared',
) {
  const fastify = {
    caches,
    config: { plexTokens: ['admin-token'], plexServerUrl, plexExistenceScope },
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

  it('moves the health check to another connection when the selection stops answering', async () => {
    const service = createService()
    expect(await service.getPlexServerUrl()).toBe(LOCAL_HTTPS)

    state.down = new Set([LOCAL_HTTPS])
    expect((await service.checkPlexServerHealth()).reachable).toBe(true)

    expect(await service.getPlexServerUrl()).toBe(REMOTE_HTTPS)
    expect(state.resourceCalls).toBe(2)
  })

  it('fails the health check when no owner connection answers', async () => {
    const service = createService()
    expect(await service.getPlexServerUrl()).toBe(LOCAL_HTTPS)

    state.down = new Set([LOCAL_HTTPS, REMOTE_HTTPS])
    expect((await service.checkPlexServerHealth()).reachable).toBe(false)
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
    const saved = 'http://plex.saved.test:32400'
    server.use(http.get(`${saved}/identity`, () => HttpResponse.error()))
    const service = createService(saved)

    expect(await service.getPlexServerUrl()).toBe(saved)
    expect(state.resourceCalls).toBe(0)

    expect((await service.checkPlexServerHealth()).reachable).toBe(false)
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

describe('PlexServerService existence check', () => {
  const SHARED_URI = 'https://10-0-0-9.xyz.plex.direct:32400'
  const SHARED = plexResource({
    name: 'Friend',
    clientIdentifier: 'shared-1',
    owned: false,
    accessToken: 'shared-token',
    connections: [plexConnection({ uri: SHARED_URI, address: '10.0.0.9' })],
  })

  type Answer = 'found' | 'missing' | 'down'

  let now: number
  let state: PlexState
  let identityCalls: Map<string, number>
  let ownerAnswer: Answer
  let sharedAnswer: Answer
  let sharedDown: boolean
  let ownerTokens: string[]
  let resourcesGate: Promise<void> | undefined

  function libraryAnswer(answer: Answer) {
    if (answer === 'down') return HttpResponse.error()
    return HttpResponse.json({
      MediaContainer:
        answer === 'found' ? { Metadata: [{ ratingKey: '1' }] } : { size: 0 },
    })
  }

  function countIdentity(uri: string, machineIdentifier: string) {
    return http.get(`${uri}/identity`, () => {
      identityCalls.set(uri, (identityCalls.get(uri) ?? 0) + 1)
      if (uri === SHARED_URI && sharedDown) return HttpResponse.error()
      return HttpResponse.json({ MediaContainer: { machineIdentifier } })
    })
  }

  function createChecker(
    scope: PlexExistenceScope = 'owned-and-shared',
    plexServerUrl = '',
  ) {
    return createService(
      plexServerUrl,
      new CacheRegistry({ now: () => now }),
      scope,
    )
  }

  const check = (service: PlexServerService, key = 'abc123') =>
    service.checkExistenceAcrossServers(key, 'movie', true)

  beforeEach(() => {
    now = 1
    state = { plexTv: 'up', down: new Set(), resourceCalls: 0 }
    identityCalls = new Map()
    ownerAnswer = 'missing'
    sharedAnswer = 'missing'
    sharedDown = false
    ownerTokens = []
    resourcesGate = undefined
    servePlex(state)
    server.use(
      http.get('https://plex.tv/api/v2/resources', async () => {
        state.resourceCalls += 1
        await resourcesGate
        return state.plexTv === 'up'
          ? HttpResponse.json([...RESOURCES, SHARED])
          : HttpResponse.error()
      }),
      countIdentity(LOCAL_HTTPS, 'machine-1'),
      countIdentity(REMOTE_HTTPS, 'machine-1'),
      countIdentity(SHARED_URI, 'shared-1'),
      http.get(`${SHARED_URI}/`, () =>
        HttpResponse.json({
          MediaContainer: { machineIdentifier: 'shared-1' },
        }),
      ),
      http.get(`${LOCAL_HTTPS}/library/all`, ({ request }) => {
        ownerTokens.push(request.headers.get('X-Plex-Token') ?? '')
        return libraryAnswer(ownerAnswer)
      }),
      http.get(`${SHARED_URI}/library/all`, () => libraryAnswer(sharedAnswer)),
    )
  })

  it('checks the owner at its negotiated connection without probing it again', async () => {
    const service = createChecker()
    await service.getPlexServerUrl()
    identityCalls.clear()

    expect(await check(service)).toBe('missing')

    expect(identityCalls.get(LOCAL_HTTPS)).toBeUndefined()
    expect(identityCalls.get(REMOTE_HTTPS)).toBeUndefined()
    expect(ownerTokens).toEqual(['admin-token'])
  })

  it('probes a shared server once for many item checks and again after the TTL', async () => {
    const service = createChecker()

    await Promise.all(
      ['a1', 'a2', 'a3', 'a4', 'a5'].map((key) => check(service, key)),
    )
    expect(identityCalls.get(SHARED_URI)).toBe(1)

    now += CONNECTION_LIST_TTL_MS + 1
    await check(service, 'a6')
    expect(identityCalls.get(SHARED_URI)).toBe(2)
  })

  it('finds content on a shared server', async () => {
    sharedAnswer = 'found'

    expect(await check(createChecker())).toBe('found')
  })

  it('answers unknown when the owner check fails', async () => {
    ownerAnswer = 'down'

    expect(await check(createChecker())).toBe('unknown')
  })

  it('answers unknown when no owner connection is settled', async () => {
    state.plexTv = 'down'

    expect(await check(createChecker())).toBe('unknown')
  })

  it('skips a shared server that fails and keeps the owner answer', async () => {
    sharedDown = true

    expect(await check(createChecker())).toBe('missing')
  })

  it('checks only the owner for an item that is not the primary user', async () => {
    sharedAnswer = 'found'
    const service = createChecker()

    expect(
      await service.checkExistenceAcrossServers('abc123', 'movie', false),
    ).toBe('missing')
    expect(identityCalls.get(SHARED_URI)).toBeUndefined()
  })

  it('checks the owner at the saved address without probing it', async () => {
    const SAVED = 'http://10.0.0.5:32400'
    const savedTokens: string[] = []
    server.use(
      http.get(`${SAVED}/library/all`, ({ request }) => {
        savedTokens.push(request.headers.get('X-Plex-Token') ?? '')
        return libraryAnswer('found')
      }),
    )

    expect(await check(createChecker('owned', SAVED))).toBe('found')
    expect(savedTokens).toEqual(['admin-token'])
    expect(ownerTokens).toEqual([])
  })

  it('starts the owner check without waiting for the shared server list', async () => {
    const service = createChecker()
    await service.getPlexServerUrl()
    const release = Promise.withResolvers<void>()
    resourcesGate = release.promise

    const result = check(service)
    await vi.waitFor(() => expect(ownerTokens).toEqual(['admin-token']))
    release.resolve()

    expect(await result).toBe('missing')
  })

  it('answers found from the owner without waiting for a shared server to resolve', async () => {
    ownerAnswer = 'found'
    const release = Promise.withResolvers<void>()
    let sharedProbeEnded = false
    server.use(
      http.get(`${SHARED_URI}/identity`, async ({ request }) => {
        request.signal.addEventListener('abort', () => {
          sharedProbeEnded = true
        })
        await release.promise
        sharedProbeEnded = true
        return HttpResponse.json({
          MediaContainer: { machineIdentifier: 'shared-1' },
        })
      }),
    )
    const service = createChecker()
    await service.getPlexServerUrl()

    expect(await check(service)).toBe('found')
    expect(sharedProbeEnded).toBe(false)
    release.resolve()
  })

  it('never reads the resources list with the owned scope', async () => {
    const service = createChecker('owned')
    await service.getPlexServerUrl()

    expect(await check(service)).toBe('missing')
    expect(state.resourceCalls).toBe(1)
    expect(identityCalls.get(SHARED_URI)).toBeUndefined()
  })

  it('reads the resources list again after its TTL', async () => {
    const service = createChecker()
    await check(service, 'b1')
    const afterFirst = state.resourceCalls

    now += CONNECTION_LIST_TTL_MS
    await check(service, 'b2')
    expect(state.resourceCalls).toBe(afterFirst)

    now += 1
    await check(service, 'b3')
    expect(state.resourceCalls).toBe(afterFirst + 1)
  })

  it('health checks only the selected owner connection', async () => {
    const service = createChecker()
    await service.getPlexServerUrl()
    identityCalls.clear()

    expect((await service.checkPlexServerHealth()).reachable).toBe(true)

    expect(identityCalls.get(LOCAL_HTTPS)).toBe(1)
    expect(identityCalls.get(REMOTE_HTTPS)).toBeUndefined()
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

describe('PlexServerService.getProtectedItems', () => {
  const PLAYLISTS = `${LOCAL_HTTPS}/playlists`
  const PLAYLIST_ITEMS = `${LOCAL_HTTPS}/playlists/:id/items`
  const METADATA = 'https://discover.provider.plex.tv/library/metadata/:id'
  const USERS = 'https://plex.tv/api/users'
  const SHARED_SERVERS = 'https://plex.tv/api/servers/machine-1/shared_servers'
  const PLAYLIST_NAME = 'Do Not Delete'

  const USERS_XML =
    '<MediaContainer><User id="7" username="alice" title="alice"><Server machineIdentifier="machine-1"/></User><User id="8" username="bob" title="bob"><Server machineIdentifier="machine-1"/></User></MediaContainer>'
  const SHARED_XML =
    '<MediaContainer><SharedServer id="1" username="alice" email="alice@example.com" userID="7" accessToken="alice-token"/></MediaContainer>'

  let playlistCreates: number

  function playlistItem(id: string) {
    return { guid: `plex://movie/${id}`, type: 'movie', title: id }
  }

  function createProtectionService() {
    servePlex({ plexTv: 'up', down: new Set(), resourceCalls: 0 })
    playlistCreates = 0
    server.use(
      http.get(USERS, () => HttpResponse.text('<MediaContainer/>')),
      http.get(SHARED_SERVERS, () => HttpResponse.text('<MediaContainer/>')),
      http.post(PLAYLISTS, () => {
        playlistCreates += 1
        return HttpResponse.json({
          MediaContainer: { Metadata: [{ ratingKey: 'new' }] },
        })
      }),
    )
    const fastify = {
      caches: new CacheRegistry(),
      config: {
        plexTokens: ['admin-token'],
        plexServerUrl: '',
        plexExistenceScope: 'owned-and-shared',
        enablePlexPlaylistProtection: true,
        plexProtectionPlaylistName: PLAYLIST_NAME,
      },
    } as unknown as FastifyInstance
    return new PlexServerService(createMockLogger(), fastify)
  }

  function servePlaylistsByToken(playlists: Record<string, string>) {
    server.use(
      http.get(PLAYLISTS, ({ request }) => {
        const id = playlists[request.headers.get('X-Plex-Token') ?? '']
        return HttpResponse.json({
          MediaContainer: {
            Metadata: id ? [{ ratingKey: id, title: PLAYLIST_NAME }] : [],
          },
        })
      }),
    )
  }

  function servePlaylistItems(items: Record<string, string[]>) {
    server.use(
      http.get(PLAYLIST_ITEMS, ({ params }) => {
        const ids = items[String(params.id)] ?? []
        return HttpResponse.json({
          MediaContainer: {
            totalSize: ids.length,
            Metadata: ids.map(playlistItem),
          },
        })
      }),
    )
  }

  function serveMetadata(missing: string[] = []) {
    server.use(
      http.get(METADATA, ({ params }) =>
        missing.includes(String(params.id))
          ? new HttpResponse(null, { status: 404 })
          : HttpResponse.json({
              MediaContainer: {
                Metadata: [{ Guid: [{ id: `tmdb://${params.id}` }] }],
              },
            }),
      ),
    )
  }

  function serveOwnerPlaylist(ids: string[]) {
    servePlaylistsByToken({ 'admin-token': 'owner-list' })
    servePlaylistItems({ 'owner-list': ids })
  }

  it('throws when the playlist fetch fails', async () => {
    const service = createProtectionService()
    servePlaylistsByToken({ 'admin-token': 'owner-list' })
    server.use(
      http.get(PLAYLIST_ITEMS, () => new HttpResponse(null, { status: 500 })),
    )

    await expect(service.getProtectedItems()).rejects.toThrow(
      /Failed to fetch playlist items: 500/,
    )
  })

  it('throws when a user with a playlist has no token', async () => {
    const service = createProtectionService()
    vi.spyOn(service, 'getOrCreateProtectionPlaylists').mockResolvedValue(
      new Map([['bob', 'bob-list']]),
    )

    await expect(service.getProtectedItems()).rejects.toThrow(
      /No token available for user "bob"/,
    )
  })

  it('throws when item metadata cannot be fetched', async () => {
    const service = createProtectionService()
    serveOwnerPlaylist(['101', '202'])
    server.use(
      http.get(METADATA, ({ params }) =>
        params.id === '202'
          ? HttpResponse.error()
          : HttpResponse.json({
              MediaContainer: { Metadata: [{ Guid: [{ id: 'tmdb://101' }] }] },
            }),
      ),
    )

    await expect(service.getProtectedItems()).rejects.toThrow(
      /Failed to fetch Plex metadata for "plex:\/\/movie\/202"/,
    )
  })

  it('skips an item plex.tv has no record of and protects the rest', async () => {
    const service = createProtectionService()
    serveOwnerPlaylist(['101', '202'])
    serveMetadata(['202'])

    expect(await service.getProtectedItems()).toEqual(new Set(['tmdb:101']))
  })

  it('throws and creates no playlist when the playlist lookup fails', async () => {
    const service = createProtectionService()
    server.use(
      http.get(PLAYLISTS, () => new HttpResponse(null, { status: 500 })),
    )

    await expect(service.getProtectedItems()).rejects.toThrow(
      /Failed to fetch playlists: 500/,
    )
    expect(playlistCreates).toBe(0)
  })

  it('creates the playlist when the user has none', async () => {
    const service = createProtectionService()
    server.use(
      http.get(PLAYLISTS, () => HttpResponse.json({ MediaContainer: {} })),
    )
    servePlaylistItems({})

    expect(await service.getProtectedItems()).toEqual(new Set())
    expect(playlistCreates).toBe(1)
  })

  it('throws when the shared servers fetch fails', async () => {
    const service = createProtectionService()
    serveOwnerPlaylist(['101'])
    serveMetadata()
    server.use(
      http.get(SHARED_SERVERS, () => new HttpResponse(null, { status: 500 })),
    )

    await expect(service.getProtectedItems()).rejects.toThrow(
      /Failed to fetch shared server info: 500/,
    )
  })

  it('throws when the users fetch fails', async () => {
    const service = createProtectionService()
    serveOwnerPlaylist(['101'])
    serveMetadata()
    server.use(http.get(USERS, () => new HttpResponse(null, { status: 500 })))

    await expect(service.getProtectedItems()).rejects.toThrow(
      /Failed to fetch users: 500/,
    )
  })

  it('skips a user with no access token and protects the others', async () => {
    const service = createProtectionService()
    server.use(
      http.get(USERS, () => HttpResponse.text(USERS_XML)),
      http.get(SHARED_SERVERS, () => HttpResponse.text(SHARED_XML)),
    )
    servePlaylistsByToken({
      'admin-token': 'owner-list',
      'alice-token': 'alice-list',
    })
    servePlaylistItems({ 'owner-list': ['101'], 'alice-list': ['303'] })
    serveMetadata()

    expect(await service.getProtectedItems()).toEqual(
      new Set(['tmdb:101', 'tmdb:303']),
    )
    expect([
      ...(await service.getOrCreateProtectionPlaylists()).keys(),
    ]).toEqual(['alice', 'owner'])
    expect(playlistCreates).toBe(0)
  })
})
