import { PlexTvError } from '@root/types/plex-server.types.js'
import { getAllPlexResources } from '@services/plex-server/resources/resource-operations.js'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { plexResource } from '../../../../mocks/plex-resources.js'
import { server } from '../../../../setup/msw-setup.js'

const RESOURCES_URL = 'https://plex.tv/api/v2/resources'

function serveResources(response: () => Response) {
  server.use(http.get(RESOURCES_URL, response))
}

const names = (list: Awaited<ReturnType<typeof getAllPlexResources>>) =>
  list.map(({ name }) => name)

describe('getAllPlexResources', () => {
  it('keeps resources that list server among several provides', async () => {
    serveResources(() =>
      HttpResponse.json([
        plexResource({ name: 'Solo', provides: 'server' }),
        plexResource({ name: 'Combo', provides: 'client,server,player' }),
        plexResource({ name: 'Player', provides: 'client,player' }),
      ]),
    )

    expect(names(await getAllPlexResources('token'))).toEqual(['Solo', 'Combo'])
  })

  it('keeps shared servers unless asked for owned ones only', async () => {
    serveResources(() =>
      HttpResponse.json([
        plexResource({ name: 'Mine' }),
        plexResource({ name: 'Shared', owned: false }),
      ]),
    )

    expect(names(await getAllPlexResources('token'))).toEqual([
      'Mine',
      'Shared',
    ])
    expect(
      names(await getAllPlexResources('token', { ownedOnly: true })),
    ).toEqual(['Mine'])
  })

  it('asks plex.tv for https connections', async () => {
    let requested: URL | undefined
    server.use(
      http.get(RESOURCES_URL, ({ request }) => {
        requested = new URL(request.url)
        return HttpResponse.json([])
      }),
    )

    await getAllPlexResources('token')

    expect(requested?.searchParams.get('includeHttps')).toBe('1')
  })

  it('throws with the status when plex.tv rejects the request', async () => {
    serveResources(() => new HttpResponse(null, { status: 401 }))

    await expect(getAllPlexResources('token')).rejects.toBeInstanceOf(
      PlexTvError,
    )
    await expect(getAllPlexResources('token')).rejects.toMatchObject({
      status: 401,
    })
  })

  it('throws when plex.tv cannot be reached', async () => {
    serveResources(() => HttpResponse.error())

    await expect(getAllPlexResources('token')).rejects.toThrow()
  })
})
