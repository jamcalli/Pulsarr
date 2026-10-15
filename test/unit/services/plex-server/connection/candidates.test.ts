import { serverCandidates } from '@services/plex-server/connection/candidates.js'
import { describe, expect, it } from 'vitest'
import {
  plexConnection,
  plexResource,
} from '../../../../mocks/plex-resources.js'

const LOCAL = plexConnection()
const REMOTE_HTTP = plexConnection({
  protocol: 'http',
  uri: 'http://73.42.118.9:32400',
  address: '73.42.118.9',
  local: false,
})
const RELAY = plexConnection({
  uri: 'https://relay.plex.direct:8443',
  local: false,
  relay: true,
})

describe('serverCandidates', () => {
  it('keeps only owned Plex Media Servers with connections', () => {
    const candidates = serverCandidates([
      plexResource({ name: 'Mine' }),
      plexResource({ name: 'Shared', owned: false }),
      plexResource({ name: 'Player', product: 'Plex for Android' }),
      plexResource({ name: 'Empty', connections: [] }),
    ])

    expect(candidates.map(({ resource }) => resource.name)).toEqual(['Mine'])
  })

  it('drops relay connections', () => {
    const [server] = serverCandidates([
      plexResource({ connections: [RELAY, LOCAL] }),
    ])

    expect(server?.connections).toEqual([LOCAL])
    expect(server?.fallback).toBeNull()
  })

  it('drops non-https connections when the server requires https', () => {
    const [server] = serverCandidates([
      plexResource({ httpsRequired: true, connections: [REMOTE_HTTP, LOCAL] }),
    ])

    expect(server?.connections).toEqual([LOCAL])
  })

  it('keeps http connections when the server allows them', () => {
    const [server] = serverCandidates([
      plexResource({ connections: [REMOTE_HTTP, LOCAL] }),
    ])

    expect(server?.connections).toEqual([REMOTE_HTTP, LOCAL])
  })

  it('falls back to every connection when only relays are listed', () => {
    const [server] = serverCandidates([plexResource({ connections: [RELAY] })])

    expect(server?.connections).toEqual([RELAY])
    expect(server?.fallback).toBe('relay-only')
  })

  it('uses an https relay when the server requires https and lists no direct https', () => {
    const [server] = serverCandidates([
      plexResource({ httpsRequired: true, connections: [REMOTE_HTTP, RELAY] }),
    ])

    expect(server?.connections).toEqual([RELAY])
    expect(server?.fallback).toBe('relay-only')
  })

  it('never offers http when the server requires https', () => {
    const [server] = serverCandidates([
      plexResource({ httpsRequired: true, connections: [REMOTE_HTTP] }),
    ])

    expect(server?.connections).toEqual([])
    expect(server?.fallback).toBe('https-required')
  })
})
