import {
  type ArrInstanceContext,
  createArrCaches,
} from '@services/arr/arr-caches.js'
import { ArrClient } from '@services/arr/arr-client.js'
import { RADARR, SONARR } from '@services/arr/arr-product.js'
import { ArrTags, bulkUpdateItemTags } from '@services/arr/arr-tags.js'
import { CacheRegistry } from '@services/cache-registry.service.js'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDeferred } from '../../../helpers/deferred.js'
import { createMockLogger } from '../../../mocks/logger.js'
import { server } from '../../../setup/msw-setup.js'

const TAG_URL = 'http://arr.test/api/v3/tag'

function context(appName: string, instanceId?: number): ArrInstanceContext {
  const client = new ArrClient({
    appName,
    baseUrl: 'http://arr.test',
    apiKey: 'key',
    timeoutMs: 1000,
  })
  return {
    appName,
    log: createMockLogger(),
    client: () => client,
    instanceId: () => instanceId,
  }
}

let now = 1
const clock = { now: () => now }

function newTags(appName: string, instanceId?: number): ArrTags {
  return new ArrTags(
    context(appName, instanceId),
    createArrCaches(new CacheRegistry(clock)).tags,
  )
}

function serveTags(...lists: Array<Array<{ id: number; label: string }>>) {
  const counter = { calls: 0 }
  server.use(
    http.get(TAG_URL, () => {
      const list = lists[Math.min(counter.calls, lists.length - 1)]
      counter.calls++
      return HttpResponse.json(list)
    }),
  )
  return counter
}

describe.each([SONARR, RADARR])('$appName tags', ({ appName }) => {
  beforeEach(() => {
    now = 1
  })

  it('serves a second read within the TTL from cache', async () => {
    const counter = serveTags([{ id: 1, label: 'a' }])
    const tags = newTags(appName, 1)

    await tags.list()
    await expect(tags.list()).resolves.toEqual([{ id: 1, label: 'a' }])
    expect(counter.calls).toBe(1)
  })

  it('re-reads once the TTL has passed', async () => {
    const counter = serveTags([{ id: 1, label: 'a' }])
    const tags = newTags(appName, 1)

    await tags.list()
    now += 30_001
    await tags.list()

    expect(counter.calls).toBe(2)
  })

  it('never caches without an instance id', async () => {
    const counter = serveTags([])
    const tags = newTags(appName)

    await tags.list()
    await tags.list()

    expect(counter.calls).toBe(2)
  })

  it('serves the stale list when a refresh fails', async () => {
    serveTags([{ id: 1, label: 'a' }])
    const tags = newTags(appName, 1)
    await tags.list()
    server.use(http.get(TAG_URL, () => new HttpResponse(null, { status: 500 })))
    now += 30_001

    await expect(tags.list()).resolves.toEqual([{ id: 1, label: 'a' }])
  })

  it('rejects a failed first read', async () => {
    server.use(http.get(TAG_URL, () => new HttpResponse(null, { status: 500 })))

    await expect(newTags(appName, 1).list()).rejects.toMatchObject({
      name: 'HttpError',
      status: 500,
    })
  })

  it('drops the cache after creating a tag', async () => {
    const counter = serveTags([], [{ id: 2, label: 'new' }])
    server.use(
      http.post(TAG_URL, () =>
        HttpResponse.json({ id: 2, label: 'new' }, { status: 201 }),
      ),
    )
    const tags = newTags(appName, 1)
    await tags.list()

    await expect(tags.create('new')).resolves.toEqual({ id: 2, label: 'new' })
    await expect(tags.list()).resolves.toEqual([{ id: 2, label: 'new' }])
    expect(counter.calls).toBe(2)
  })

  it('returns the existing tag on a 409', async () => {
    serveTags([{ id: 4, label: 'kids' }])
    server.use(
      http.post(TAG_URL, () => new HttpResponse(null, { status: 409 })),
    )

    await expect(newTags(appName, 1).create('kids')).resolves.toEqual({
      id: 4,
      label: 'kids',
    })
  })

  it('throws when the arr answers a create with no tag', async () => {
    server.use(
      http.post(TAG_URL, () => new HttpResponse(null, { status: 204 })),
    )

    await expect(newTags(appName, 1).create('kids')).rejects.toThrow(
      `${appName} returned no tag for "kids"`,
    )
  })

  it('drops the cache after deleting a tag', async () => {
    const counter = serveTags([{ id: 1, label: 'a' }], [])
    server.use(
      http.delete(
        `${TAG_URL}/1`,
        () => new HttpResponse(null, { status: 200 }),
      ),
    )
    const tags = newTags(appName, 1)
    await tags.list()

    await tags.delete(1)

    await expect(tags.list()).resolves.toEqual([])
    expect(counter.calls).toBe(2)
  })

  describe('resolveForAdd', () => {
    const existing = [
      { id: 5, label: 'kids' },
      { id: 7, label: 'anime' },
    ]

    it('keeps requested ids and labels that exist', async () => {
      serveTags(existing)

      await expect(
        newTags(appName, 1).resolveForAdd(
          ['5', 'anime', '9', 'missing', 'kids'],
          ['7'],
        ),
      ).resolves.toEqual({ ids: ['5', '7'], existing })
    })

    it('falls back to the default ids when none are requested', async () => {
      serveTags(existing)

      await expect(
        newTags(appName, 1).resolveForAdd([], ['7', '9', 'kids']),
      ).resolves.toEqual({ ids: ['7'], existing })
    })

    it('reads no tags when there is nothing to resolve', async () => {
      const counter = serveTags(existing)

      await expect(
        newTags(appName, 1).resolveForAdd(undefined, []),
      ).resolves.toEqual({ ids: [], existing: [] })
      expect(counter.calls).toBe(0)
    })
  })
})

describe.each([
  { product: SONARR, path: 'series/editor', idsKey: 'seriesIds' },
  { product: RADARR, path: 'movie/editor', idsKey: 'movieIds' },
])('$product.appName bulk tag editor', ({ product, path, idsKey }) => {
  function serveEditor() {
    const bodies: object[] = []
    server.use(
      http.put(`http://arr.test/api/v3/${path}`, async ({ request }) => {
        bodies.push((await request.json()) as object)
        return HttpResponse.json([], { status: 202 })
      }),
    )
    return bodies
  }

  function update(...updates: Array<{ itemId: number; tagIds: number[] }>) {
    const { client } = context(product.appName, 1)
    return bulkUpdateItemTags(
      client(),
      product,
      createMockLogger(),
      updates,
      'add',
    )
  }

  it('sends one request per distinct tag set under the product ids key', async () => {
    const bodies = serveEditor()

    await update(
      { itemId: 1, tagIds: [10, 2] },
      { itemId: 2, tagIds: [2, 10, 2] },
      { itemId: 3, tagIds: [] },
    )

    expect(bodies).toEqual(
      expect.arrayContaining([
        { [idsKey]: [1, 2], tags: [2, 10], applyTags: 'add' },
        { [idsKey]: [3], tags: [], applyTags: 'add' },
      ]),
    )
    expect(bodies).toHaveLength(2)
  })

  it('sends nothing for no updates', async () => {
    const bodies = serveEditor()

    await update()

    expect(bodies).toEqual([])
  })

  it('rejects when the arr refuses the edit', async () => {
    server.use(
      http.put(
        `http://arr.test/api/v3/${path}`,
        () => new HttpResponse(null, { status: 400 }),
      ),
    )

    await expect(update({ itemId: 1, tagIds: [1] })).rejects.toMatchObject({
      name: 'HttpError',
      status: 400,
    })
  })

  it('starts no further group once one fails, then rejects after the rest land', async () => {
    const gate = createDeferred<void>()
    let started = 0
    server.use(
      http.put(`http://arr.test/api/v3/${path}`, async ({ request }) => {
        started++
        const body = (await request.json()) as { tags: number[] }
        if (body.tags[0] === 0) return new HttpResponse(null, { status: 500 })
        await gate.promise
        return HttpResponse.json([], { status: 202 })
      }),
    )

    const run = update(
      ...Array.from({ length: 6 }, (_, tag) => ({
        itemId: tag,
        tagIds: [tag],
      })),
    )
    const outcome = run.catch((error: Error) => error)
    await vi.waitFor(() => expect(started).toBeGreaterThanOrEqual(4))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(started).toBe(4)

    gate.resolve()

    expect(await outcome).toMatchObject({ name: 'HttpError', status: 500 })
    expect(started).toBe(4)
  })
})
