import type { RouterRule } from '@root/types/router.types.js'
import { RuleCache } from '@services/content-router/rule-cache.js'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { createMockLogger } from '../../../mocks/logger.js'

describe('RuleCache', () => {
  let fetch: Mock<() => Promise<RouterRule[]>>
  let cache: RuleCache

  beforeEach(() => {
    fetch = vi.fn<() => Promise<RouterRule[]>>()
    cache = new RuleCache(fetch, createMockLogger())
  })

  it('does not cache a fetch that resolves after the cache was cleared', async () => {
    let resolveStale: (rules: RouterRule[]) => void = () => {}
    fetch
      .mockImplementationOnce(
        () =>
          new Promise<RouterRule[]>((resolve) => {
            resolveStale = resolve
          }),
      )
      .mockResolvedValueOnce([])

    const stale = cache.get()
    cache.clear()
    resolveStale([])
    await stale

    expect(await cache.get()).toEqual([])
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('shares one in-flight fetch between concurrent callers', async () => {
    fetch.mockResolvedValue([])

    const [first, second] = await Promise.all([cache.get(), cache.get()])

    expect(first).toBe(second)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('serves later calls from the cache', async () => {
    fetch.mockResolvedValue([])

    await cache.get()
    await cache.get()

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not cache a rejected fetch and refetches on the next get', async () => {
    fetch.mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce([])

    await expect(cache.get()).rejects.toThrow('db down')
    expect(await cache.get()).toEqual([])
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
