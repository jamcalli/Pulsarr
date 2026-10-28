import { ArrClient } from '@services/arr/arr-client.js'
import type { ArrInstanceContext } from '@services/arr/arr-instance-cache.js'
import { RADARR, SONARR } from '@services/arr/arr-product.js'
import { ArrTags } from '@services/arr/arr-tags.js'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
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
  it('serves a second read within the TTL from cache', async () => {
    const counter = serveTags([{ id: 1, label: 'a' }])
    const tags = new ArrTags(context(appName, 1))

    await tags.list()
    await expect(tags.list()).resolves.toEqual([{ id: 1, label: 'a' }])
    expect(counter.calls).toBe(1)
  })

  it('re-reads once the TTL has passed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const counter = serveTags([{ id: 1, label: 'a' }])
      const tags = new ArrTags(context(appName, 1))

      await tags.list()
      vi.advanceTimersByTime(30_001)
      await tags.list()

      expect(counter.calls).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('never caches without an instance id', async () => {
    const counter = serveTags([])
    const tags = new ArrTags(context(appName))

    await tags.list()
    await tags.list()

    expect(counter.calls).toBe(2)
  })

  it('serves the stale list when a refresh fails', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      serveTags([{ id: 1, label: 'a' }])
      const tags = new ArrTags(context(appName, 1))
      await tags.list()
      server.use(
        http.get(TAG_URL, () => new HttpResponse(null, { status: 500 })),
      )
      vi.advanceTimersByTime(30_001)

      await expect(tags.list()).resolves.toEqual([{ id: 1, label: 'a' }])
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects a failed first read', async () => {
    server.use(http.get(TAG_URL, () => new HttpResponse(null, { status: 500 })))

    await expect(new ArrTags(context(appName, 1)).list()).rejects.toThrow()
  })

  it('drops the cache after creating a tag', async () => {
    const counter = serveTags([], [{ id: 2, label: 'new' }])
    server.use(
      http.post(TAG_URL, () =>
        HttpResponse.json({ id: 2, label: 'new' }, { status: 201 }),
      ),
    )
    const tags = new ArrTags(context(appName, 1))
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

    await expect(
      new ArrTags(context(appName, 1)).create('kids'),
    ).resolves.toEqual({ id: 4, label: 'kids' })
  })

  it('throws when the arr answers a create with no tag', async () => {
    server.use(
      http.post(TAG_URL, () => new HttpResponse(null, { status: 204 })),
    )

    await expect(
      new ArrTags(context(appName, 1)).create('kids'),
    ).rejects.toThrow(`${appName} returned no tag for "kids"`)
  })

  it('drops the cache after deleting a tag', async () => {
    const counter = serveTags([{ id: 1, label: 'a' }], [])
    server.use(
      http.delete(
        `${TAG_URL}/1`,
        () => new HttpResponse(null, { status: 200 }),
      ),
    )
    const tags = new ArrTags(context(appName, 1))
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
        new ArrTags(context(appName, 1)).resolveForAdd(
          ['5', 'anime', '9', 'missing', 'kids'],
          ['7'],
        ),
      ).resolves.toEqual({ ids: ['5', '7'], existing })
    })

    it('falls back to the default ids when none are requested', async () => {
      serveTags(existing)

      await expect(
        new ArrTags(context(appName, 1)).resolveForAdd([], ['7', '9', 'kids']),
      ).resolves.toEqual({ ids: ['7'], existing })
    })

    it('reads no tags when there is nothing to resolve', async () => {
      const counter = serveTags(existing)

      await expect(
        new ArrTags(context(appName, 1)).resolveForAdd(undefined, []),
      ).resolves.toEqual({ ids: [], existing: [] })
      expect(counter.calls).toBe(0)
    })
  })
})
