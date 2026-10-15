import {
  CONNECTION_LIST_TTL_MS,
  NEGOTIATION_RETRY_GAP_MS,
  PlexServerService,
} from '@services/plex-server.service.js'
import type { FastifyInstance } from 'fastify'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'
import { plexConnection, plexResource } from '../../mocks/plex-resources.js'
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
        state.down.has(uri) ? HttpResponse.error() : HttpResponse.json({}),
      ),
      http.get(`${uri}/`, () =>
        state.down.has(uri) ? HttpResponse.error() : HttpResponse.json({}),
      ),
      http.get(`${uri}/library/sections`, () =>
        HttpResponse.json({ MediaContainer: { Directory: [{ key: '1' }] } }),
      ),
    ]),
  )
}

function createService(plexServerUrl = '') {
  const fastify = {
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

  it('never caches the fallback when plex.tv cannot be reached', async () => {
    const service = createService()
    state.plexTv = 'down'

    expect(await service.getPlexServerUrl()).toBe(FALLBACK)
    expect(await service.getPlexServerUrl()).toBe(FALLBACK)
    expect(state.resourceCalls).toBe(1)

    state.plexTv = 'up'
    vi.advanceTimersByTime(NEGOTIATION_RETRY_GAP_MS)

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
    vi.advanceTimersByTime(NEGOTIATION_RETRY_GAP_MS)

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

  it('reports the status of the address in use', async () => {
    const service = createService()
    state.down = new Set([REMOTE_HTTPS])

    expect(await service.getServerStatus()).toMatchObject({
      url: LOCAL_HTTPS,
      automatic: true,
      reachable: true,
      failure: null,
      serverName: 'Basement',
    })

    state.down = new Set([LOCAL_HTTPS])
    expect(await service.getServerStatus()).toMatchObject({
      url: LOCAL_HTTPS,
      reachable: false,
      latencyMs: null,
      failure: 'unreachable',
    })
    expect(state.resourceCalls).toBe(1)
  })
})
