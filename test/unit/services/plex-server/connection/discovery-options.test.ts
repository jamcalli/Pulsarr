import { serverCandidates } from '@services/plex-server/connection/candidates.js'
import { discoveryOptions } from '@services/plex-server/connection/discovery-options.js'
import { describe, expect, it } from 'vitest'
import {
  plexConnection,
  plexResource,
} from '../../../../mocks/plex-resources.js'

const uris = (options: ReturnType<typeof discoveryOptions>) =>
  options.map(({ uri }) => uri)

describe('discoveryOptions', () => {
  it('offers the connection address and its plain http address', () => {
    const options = discoveryOptions(serverCandidates([plexResource()]))

    expect(uris(options)).toEqual([
      'https://192-168-1-10.abc.plex.direct:32400',
      'http://192.168.1.10:32400',
    ])
    expect(options[0]).toMatchObject({
      name: 'Basement (192-168-1-10.abc.plex.direct)',
      useSsl: true,
      local: true,
    })
  })

  it('offers no plain http address when the server requires https', () => {
    const options = discoveryOptions(
      serverCandidates([plexResource({ httpsRequired: true })]),
    )

    expect(uris(options)).toEqual([
      'https://192-168-1-10.abc.plex.direct:32400',
    ])
  })

  it('skips bare IPv6 addresses and duplicates', () => {
    const options = discoveryOptions(
      serverCandidates([
        plexResource({
          connections: [
            plexConnection({
              protocol: 'http',
              uri: 'http://192.168.1.10:32400',
            }),
            plexConnection({
              uri: 'https://2001-db8--1.abc.plex.direct:32400',
              address: '2001:db8::1',
              IPv6: true,
            }),
          ],
        }),
      ]),
    )

    expect(uris(options)).toEqual([
      'http://192.168.1.10:32400',
      'https://2001-db8--1.abc.plex.direct:32400',
    ])
  })
})
