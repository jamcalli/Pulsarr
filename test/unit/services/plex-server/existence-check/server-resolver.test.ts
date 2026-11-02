import type { PlexResource } from '@root/types/plex-server.types.js'
import { CacheRegistry } from '@services/cache-registry.service.js'
import { sharedServerCandidates } from '@services/plex-server/connection/candidates.js'
import {
  createSharedServerResolver,
  DEAD_SERVER_BACKOFF_MS,
  type SharedServerResolver,
} from '@services/plex-server/existence-check/server-resolver.js'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'
import {
  plexConnection,
  plexResource,
} from '../../../../mocks/plex-resources.js'
import { server } from '../../../../setup/msw-setup.js'

const TTL_MS = 15 * 60 * 1000
const MACHINE_ID = 'shared-1'

const LOCAL_HTTP = plexConnection({
  protocol: 'http',
  uri: 'http://192.168.5.10:32400',
  address: '192.168.5.10',
})
const LOCAL_HTTPS = plexConnection({
  uri: 'https://192-168-5-10.def.plex.direct:32400',
  address: '192.168.5.10',
})
const REMOTE_HTTP = plexConnection({
  protocol: 'http',
  uri: 'http://81.2.3.4:32400',
  address: '81.2.3.4',
  local: false,
})
const REMOTE_HTTPS = plexConnection({
  uri: 'https://81-2-3-4.def.plex.direct:32400',
  address: '81.2.3.4',
  local: false,
})
const RELAY = plexConnection({
  uri: 'https://relay-5.def.plex.direct:8443',
  address: '10.0.0.1',
  local: false,
  relay: true,
})
const ALL = [LOCAL_HTTP, LOCAL_HTTPS, REMOTE_HTTP, REMOTE_HTTPS, RELAY]

function sharedResource(overrides: Partial<PlexResource> = {}) {
  return plexResource({
    name: 'Friend',
    clientIdentifier: MACHINE_ID,
    owned: false,
    accessToken: 'shared-token',
    ...overrides,
  })
}

function candidatesFor(resource: PlexResource) {
  const [candidates] = sharedServerCandidates([resource])
  if (!candidates) throw new Error('expected shared server candidates')
  return candidates
}

describe('createSharedServerResolver', () => {
  let now: number
  let resolver: SharedServerResolver
  let down: Set<string>
  let impostors: Set<string>
  let identityCalls: Map<string, number>
  let accessTokens: string[]
  let accessUris: string[]
  let accessDown: Set<string>

  function serve() {
    server.use(
      ...ALL.flatMap(({ uri }) => [
        http.get(`${uri}/identity`, () => {
          identityCalls.set(uri, (identityCalls.get(uri) ?? 0) + 1)
          if (down.has(uri)) return HttpResponse.error()
          const machineIdentifier = impostors.has(uri) ? 'other' : MACHINE_ID
          return HttpResponse.json({ MediaContainer: { machineIdentifier } })
        }),
        http.get(`${uri}/`, ({ request }) => {
          accessTokens.push(request.headers.get('X-Plex-Token') ?? '')
          accessUris.push(uri)
          if (accessDown.has(uri)) return HttpResponse.error()
          if (request.headers.get('X-Plex-Token') !== 'shared-token') {
            return new HttpResponse(null, { status: 401 })
          }
          return HttpResponse.json({
            MediaContainer: { machineIdentifier: MACHINE_ID },
          })
        }),
      ]),
    )
  }

  const totalProbes = () =>
    [...identityCalls.values()].reduce((sum, calls) => sum + calls, 0)

  beforeEach(() => {
    now = 1
    down = new Set()
    impostors = new Set()
    identityCalls = new Map()
    accessTokens = []
    accessUris = []
    accessDown = new Set()
    resolver = createSharedServerResolver(
      new CacheRegistry({ now: () => now }),
      TTL_MS,
      createMockLogger(),
    )
    serve()
  })

  it('probes once for concurrent lookups and again after the TTL', async () => {
    const candidates = candidatesFor(
      sharedResource({ connections: [LOCAL_HTTPS] }),
    )

    await Promise.all([
      resolver.resolve(candidates),
      resolver.resolve(candidates),
      resolver.resolve(candidates),
    ])
    now += TTL_MS
    await resolver.resolve(candidates)
    expect(totalProbes()).toBe(1)

    now += 1
    await resolver.resolve(candidates)
    expect(totalProbes()).toBe(2)
  })

  it('checks access on the best connection with the shared server token', async () => {
    const resolved = await resolver.resolve(
      candidatesFor(sharedResource({ connections: [LOCAL_HTTPS] })),
    )

    expect(resolved).toEqual({
      clientId: MACHINE_ID,
      name: 'Friend',
      uri: LOCAL_HTTPS.uri,
      accessToken: 'shared-token',
    })
    expect(accessTokens).toEqual(['shared-token'])
  })

  it('prefers local, then https', async () => {
    const local = await resolver.resolve(
      candidatesFor(
        sharedResource({ connections: [REMOTE_HTTPS, LOCAL_HTTP] }),
      ),
    )
    resolver.clear()
    const https = await resolver.resolve(
      candidatesFor(
        sharedResource({ connections: [REMOTE_HTTP, REMOTE_HTTPS] }),
      ),
    )

    expect(local?.uri).toBe(LOCAL_HTTP.uri)
    expect(https?.uri).toBe(REMOTE_HTTPS.uri)
  })

  it('rejects a connection that answers as another server', async () => {
    impostors.add(LOCAL_HTTPS.uri)

    const resolved = await resolver.resolve(
      candidatesFor(
        sharedResource({ connections: [LOCAL_HTTPS, REMOTE_HTTPS] }),
      ),
    )

    expect(resolved?.uri).toBe(REMOTE_HTTPS.uri)
  })

  it('never probes plain http when the server requires https', async () => {
    const resolved = await resolver.resolve(
      candidatesFor(
        sharedResource({
          httpsRequired: true,
          connections: [LOCAL_HTTP, REMOTE_HTTPS],
        }),
      ),
    )

    expect(resolved?.uri).toBe(REMOTE_HTTPS.uri)
    expect(identityCalls.has(LOCAL_HTTP.uri)).toBe(false)
  })

  it('uses a relay only when Plex lists no direct connection', async () => {
    down.add(LOCAL_HTTPS.uri)

    expect(
      await resolver.resolve(
        candidatesFor(sharedResource({ connections: [LOCAL_HTTPS, RELAY] })),
      ),
    ).toBeNull()
    expect(identityCalls.has(RELAY.uri)).toBe(false)

    resolver.clear()
    const relayOnly = await resolver.resolve(
      candidatesFor(sharedResource({ connections: [RELAY] })),
    )
    expect(relayOnly?.uri).toBe(RELAY.uri)
  })

  it('backs off from a server with no working connection, then retries', async () => {
    const candidates = candidatesFor(
      sharedResource({ connections: [LOCAL_HTTPS] }),
    )
    down.add(LOCAL_HTTPS.uri)

    expect(await resolver.resolve(candidates)).toBeNull()
    down.clear()
    expect(await resolver.resolve(candidates)).toBeNull()
    expect(totalProbes()).toBe(1)

    now += DEAD_SERVER_BACKOFF_MS + 1
    expect((await resolver.resolve(candidates))?.uri).toBe(LOCAL_HTTPS.uri)
    expect(totalProbes()).toBe(2)
  })

  it('backs off from a server that refuses its token', async () => {
    const candidates = candidatesFor(
      sharedResource({
        accessToken: 'stale-token',
        connections: [LOCAL_HTTPS],
      }),
    )

    expect(await resolver.resolve(candidates)).toBeNull()
    expect(await resolver.resolve(candidates)).toBeNull()

    expect(accessTokens).toEqual(['stale-token'])
  })

  it('falls back to the next address when the best one fails its access check', async () => {
    accessDown.add(LOCAL_HTTPS.uri)

    const resolved = await resolver.resolve(
      candidatesFor(
        sharedResource({ connections: [LOCAL_HTTPS, REMOTE_HTTPS] }),
      ),
    )

    expect(resolved?.uri).toBe(REMOTE_HTTPS.uri)
    expect(accessUris).toEqual([LOCAL_HTTPS.uri, REMOTE_HTTPS.uri])
  })

  it('stops at the first address that refuses the token', async () => {
    const resolved = await resolver.resolve(
      candidatesFor(
        sharedResource({
          accessToken: 'stale-token',
          connections: [LOCAL_HTTPS, REMOTE_HTTPS],
        }),
      ),
    )

    expect(resolved).toBeNull()
    expect(accessUris).toEqual([LOCAL_HTTPS.uri])
  })

  it('probes again after the connection is invalidated', async () => {
    const candidates = candidatesFor(
      sharedResource({ connections: [LOCAL_HTTPS] }),
    )
    await resolver.resolve(candidates)

    resolver.invalidate(MACHINE_ID)
    await resolver.resolve(candidates)

    expect(totalProbes()).toBe(2)
  })
})
