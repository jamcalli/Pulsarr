import { HttpError } from '@root/types/arr-connection.types.js'
import { ArrClient } from '@services/arr/arr-client.js'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../../../setup/msw-setup.js'

function client(baseUrl = 'arr.test'): ArrClient {
  return new ArrClient({
    appName: 'Sonarr',
    baseUrl,
    apiKey: 'key',
    timeoutMs: 1000,
  })
}

describe('ArrClient', () => {
  it('prefixes http:// and /api/v3 and sends the api key', async () => {
    let seen: { url: string; apiKey: string | null } | undefined
    server.use(
      http.get('http://arr.test/api/v3/series/lookup', ({ request }) => {
        seen = { url: request.url, apiKey: request.headers.get('X-Api-Key') }
        return HttpResponse.json([{ id: 1 }])
      }),
    )

    await expect(
      client().get<Array<{ id: number }>>('series/lookup?term=tvdb:5'),
    ).resolves.toEqual([{ id: 1 }])
    expect(seen).toEqual({
      url: 'http://arr.test/api/v3/series/lookup?term=tvdb:5',
      apiKey: 'key',
    })
  })

  it('keeps an https base URL as given', () => {
    expect(client('https://arr.test').baseUrl).toBe('https://arr.test')
  })

  it('sends JSON bodies and returns the JSON reply', async () => {
    let body: object | undefined
    server.use(
      http.post('http://arr.test/api/v3/tag', async ({ request }) => {
        body = (await request.json()) as object
        return HttpResponse.json({ id: 3, label: 'kids' }, { status: 201 })
      }),
    )

    await expect(client().post('tag', { label: 'kids' })).resolves.toEqual({
      id: 3,
      label: 'kids',
    })
    expect(body).toEqual({ label: 'kids' })
  })

  it('resolves undefined on a 204', async () => {
    server.use(
      http.post(
        'http://arr.test/api/v3/notification/test',
        () => new HttpResponse(null, { status: 204 }),
      ),
      http.put(
        'http://arr.test/api/v3/series/editor',
        () => new HttpResponse(null, { status: 204 }),
      ),
    )

    await expect(client().post('notification/test', {})).resolves.toBe(
      undefined,
    )
    await expect(client().put('series/editor', {})).resolves.toBe(undefined)
  })

  it('resolves undefined on an empty non-JSON body', async () => {
    server.use(
      http.post(
        'http://arr.test/api/v3/command',
        () => new HttpResponse('', { status: 201 }),
      ),
    )

    await expect(client().post('command', {})).resolves.toBe(undefined)
  })

  it('throws the arr validation message with status and failures', async () => {
    server.use(
      http.post('http://arr.test/api/v3/series', () =>
        HttpResponse.json(
          [{ propertyName: 'Path', errorMessage: 'Path is invalid' }],
          { status: 400 },
        ),
      ),
    )

    const error = await client()
      .post('series', {})
      .catch((caught: Error) => caught)

    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({
      message: 'Path is invalid',
      status: 400,
      failures: [{ propertyName: 'Path', errorMessage: 'Path is invalid' }],
    })
  })

  it('names the missing resource on a 404 delete', async () => {
    server.use(
      http.delete(
        'http://arr.test/api/v3/tag/7',
        () => new HttpResponse(null, { status: 404 }),
      ),
    )

    await expect(client().delete('tag/7')).rejects.toThrow(
      'Resource not found: tag/7',
    )
  })

  it('reads every page of a paged endpoint', async () => {
    const pages: string[] = []
    server.use(
      http.get(
        'http://arr.test/api/v3/importlistexclusion/paged',
        ({ request }) => {
          const url = new URL(request.url)
          pages.push(url.search)
          const page = Number(url.searchParams.get('page'))
          return HttpResponse.json({
            totalRecords: 3,
            records: page === 1 ? [{ id: 1 }, { id: 2 }] : [{ id: 3 }],
          })
        },
      ),
    )

    await expect(
      client().getAllPages<{ id: number }>(
        'importlistexclusion/paged',
        'title',
        2,
      ),
    ).resolves.toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
    expect(pages).toEqual([
      '?page=1&pageSize=2&sortDirection=ascending&sortKey=title',
      '?page=2&pageSize=2&sortDirection=ascending&sortKey=title',
    ])
  })

  it('stops paging when a page comes back empty under a stale total', async () => {
    let requests = 0
    server.use(
      http.get('http://arr.test/api/v3/importlistexclusion/paged', () => {
        requests++
        return HttpResponse.json({
          totalRecords: 5,
          records: requests === 1 ? [{ id: 1 }, { id: 2 }] : [],
        })
      }),
    )

    await expect(
      client().getAllPages<{ id: number }>(
        'importlistexclusion/paged',
        'title',
        2,
      ),
    ).resolves.toEqual([{ id: 1 }, { id: 2 }])
    expect(requests).toBe(2)
  })

  it('builds paged errors from the arr response', async () => {
    server.use(
      http.get('http://arr.test/api/v3/exclusions/paged', () =>
        HttpResponse.json({ message: 'Database is locked' }, { status: 500 }),
      ),
    )

    await expect(
      client().getAllPages('exclusions/paged', 'movieTitle'),
    ).rejects.toThrow('Database is locked')
  })
})
