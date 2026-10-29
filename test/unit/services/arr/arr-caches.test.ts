import {
  ARR_RESOURCE_CACHE_TTL_MS,
  type ArrCaches,
  type ArrExclusions,
  type ArrInstanceContext,
  createArrCaches,
  dropArrCacheEntries,
  readArrCache,
} from '@services/arr/arr-caches.js'
import { ArrClient } from '@services/arr/arr-client.js'
import { RADARR, SONARR } from '@services/arr/arr-product.js'
import { CacheRegistry } from '@services/cache-registry.service.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../mocks/logger.js'

function excluded(...ids: number[]): ArrExclusions<string> {
  return { items: ids.map((id) => `item ${id}`), ids: new Set(ids) }
}

describe.each([SONARR, RADARR])('$appName caches', ({ appName }) => {
  let now: number
  let caches: ArrCaches<{ id: number }, string>

  function context(instanceId = 1): ArrInstanceContext {
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

  function readExclusions(
    load: () => Promise<ArrExclusions<string>>,
    instance = context(),
  ) {
    return readArrCache(caches.exclusions, instance, load)
  }

  beforeEach(() => {
    now = 1
    caches = createArrCaches(new CacheRegistry({ now: () => now }))
  })

  describe('resources', () => {
    it('serves a read within the TTL from one load', async () => {
      const load = vi.fn(async () => excluded(1, 2))

      await readExclusions(load)
      now += ARR_RESOURCE_CACHE_TTL_MS
      await expect(readExclusions(load)).resolves.toEqual(excluded(1, 2))

      expect(load).toHaveBeenCalledOnce()
    })

    it('reloads once the TTL has passed', async () => {
      const load = vi.fn(async () => excluded(1))

      await readExclusions(load)
      now += ARR_RESOURCE_CACHE_TTL_MS + 1
      await readExclusions(load)

      expect(load).toHaveBeenCalledTimes(2)
    })

    it('shares one pending load between concurrent reads', async () => {
      const gate = Promise.withResolvers<ArrExclusions<string>>()
      const load = vi.fn(() => gate.promise)

      const reads = Promise.all([readExclusions(load), readExclusions(load)])
      gate.resolve(excluded(1))

      await expect(reads).resolves.toEqual([excluded(1), excluded(1)])
      expect(load).toHaveBeenCalledOnce()
    })

    it('keeps a pending load shared past the TTL', async () => {
      const gate = Promise.withResolvers<ArrExclusions<string>>()
      const load = vi.fn(() => gate.promise)

      const first = readExclusions(load)
      now += ARR_RESOURCE_CACHE_TTL_MS + 1_000
      const second = readExclusions(load)
      gate.resolve(excluded(1))

      await expect(Promise.all([first, second])).resolves.toEqual([
        excluded(1),
        excluded(1),
      ])
      expect(load).toHaveBeenCalledOnce()
    })

    it('serves the last good value when a refresh fails', async () => {
      await readExclusions(async () => excluded(1))
      now += ARR_RESOURCE_CACHE_TTL_MS + 1
      const failing = vi.fn(async () => {
        throw new Error('down')
      })

      await expect(readExclusions(failing)).resolves.toEqual(excluded(1))
      await expect(readExclusions(failing)).resolves.toEqual(excluded(1))
      expect(failing).toHaveBeenCalledTimes(2)
    })

    it('rejects a failed first load and retries on the next read', async () => {
      const load = vi
        .fn<() => Promise<ArrExclusions<string>>>()
        .mockRejectedValueOnce(new Error('down'))
        .mockResolvedValueOnce(excluded(1))

      await expect(readExclusions(load)).rejects.toThrow('down')
      await expect(readExclusions(load)).resolves.toEqual(excluded(1))
    })

    it('loads every time without an instance id', async () => {
      const load = vi.fn(async () => excluded(1))

      const noId = { ...context(), instanceId: () => undefined }

      await readExclusions(load, noId)
      await readExclusions(load, noId)

      expect(load).toHaveBeenCalledTimes(2)
      expect(caches.exclusions.entries.size).toBe(0)
    })

    it('keys entries by instance id', async () => {
      await readExclusions(async () => excluded(1), context(1))

      await expect(
        readExclusions(async () => excluded(2), context(2)),
      ).resolves.toEqual(excluded(2))
    })
  })

  describe('fresh reads', () => {
    it('skip a cached value within the TTL', async () => {
      await readArrCache(caches.tags, context(), async () => [])
      const load = vi.fn(async () => [{ id: 1, label: 'new' }])

      await expect(
        readArrCache(caches.tags, context(), load, { fresh: true }),
      ).resolves.toEqual([{ id: 1, label: 'new' }])
      expect(load).toHaveBeenCalledOnce()
    })

    it('reject instead of serving the stale value', async () => {
      await readArrCache(caches.tags, context(), async () => [])

      await expect(
        readArrCache(
          caches.tags,
          context(),
          async () => {
            throw new Error('down')
          },
          { fresh: true },
        ),
      ).rejects.toThrow('down')
    })

    it('join a load already in flight', async () => {
      const gate = Promise.withResolvers<Array<{ id: number; label: string }>>()
      const load = vi.fn(() => gate.promise)

      const cached = readArrCache(caches.tags, context(), load)
      const fresh = readArrCache(caches.tags, context(), load, { fresh: true })
      gate.resolve([])

      await Promise.all([cached, fresh])
      expect(load).toHaveBeenCalledOnce()
    })
  })

  describe('library', () => {
    function readLibrary(load: () => Promise<Array<{ id: number }>>) {
      return readArrCache(caches.library, context(), load, { fresh: true })
    }

    it('shares a load in flight and starts a new one for a later read', async () => {
      const gate = Promise.withResolvers<Array<{ id: number }>>()
      const load = vi.fn(() => gate.promise)

      const reads = Promise.all([readLibrary(load), readLibrary(load)])
      gate.resolve([{ id: 1 }])
      await expect(reads).resolves.toEqual([[{ id: 1 }], [{ id: 1 }]])
      expect(load).toHaveBeenCalledOnce()

      load.mockResolvedValueOnce([{ id: 2 }])
      await expect(readLibrary(load)).resolves.toEqual([{ id: 2 }])
      expect(load).toHaveBeenCalledTimes(2)
    })

    it('stores nothing once a load settles', async () => {
      await readLibrary(async () => [{ id: 1 }])

      expect(caches.library.entries.size).toBe(0)
    })
  })

  describe('dropArrCacheEntries', () => {
    it("removes only that instance's entries", async () => {
      await readExclusions(async () => excluded(1), context(1))
      await readExclusions(async () => excluded(2), context(2))
      await readArrCache(caches.tags, context(1), async () => [])
      await readArrCache(caches.qualityProfiles, context(1), async () => [])

      dropArrCacheEntries(caches, 1)

      expect(caches.exclusions.entries.has(1)).toBe(false)
      expect(caches.tags.entries.has(1)).toBe(false)
      expect(caches.qualityProfiles.entries.has(1)).toBe(false)
      expect(caches.exclusions.entries.has(2)).toBe(true)
    })

    it('still answers a read in flight without writing it back', async () => {
      const gate = Promise.withResolvers<ArrExclusions<string>>()
      const pending = readExclusions(() => gate.promise)

      dropArrCacheEntries(caches, 1)
      gate.resolve(excluded(1))

      await expect(pending).resolves.toEqual(excluded(1))
      expect(caches.exclusions.entries.has(1)).toBe(false)
    })
  })
})
