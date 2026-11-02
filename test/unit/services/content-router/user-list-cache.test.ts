import { CacheRegistry } from '@services/cache-registry.service.js'
import {
  createUserListCache,
  LIST_CACHE_TTL_MS,
  readUserLists,
  type UserListCache,
  type UserLists,
} from '@services/content-router/user-list-cache.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function lists(...names: string[]): UserLists {
  return new Map(names.map((name) => [name, new Set([`${name}-key`])]))
}

describe('user list cache', () => {
  let now: number
  let cache: UserListCache

  function read(names: string[], load: () => Promise<UserLists | null>) {
    return readUserLists(cache, 1, { names: new Set(names), load })
  }

  beforeEach(() => {
    now = 1
    cache = createUserListCache(new CacheRegistry({ now: () => now }))
  })

  it('serves names it has loaded for until the TTL passes', async () => {
    const load = vi.fn(async () => lists('favorites'))

    await read(['favorites'], load)
    now += LIST_CACHE_TTL_MS
    await expect(read(['favorites'], load)).resolves.toEqual(lists('favorites'))
    expect(load).toHaveBeenCalledOnce()

    now += 1
    await read(['favorites'], load)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('serves a name a load covered even when no list matched it', async () => {
    const load = vi.fn(async () => lists())

    await read(['missing'], load)
    await read(['missing'], load)

    expect(load).toHaveBeenCalledOnce()
  })

  it('loads names it has not covered and keeps the lists it had', async () => {
    await read(['favorites'], async () => lists('favorites'))
    const load = vi.fn(async () => lists('horror'))

    await expect(read(['horror'], load)).resolves.toEqual(
      lists('favorites', 'horror'),
    )
    await read(['favorites', 'horror'], load)
    expect(load).toHaveBeenCalledOnce()
  })

  it('shares one load between concurrent reads for a user', async () => {
    const gate = Promise.withResolvers<UserLists>()
    const load = vi.fn(() => gate.promise)

    const reads = Promise.all([
      read(['favorites'], load),
      read(['favorites'], load),
    ])
    gate.resolve(lists('favorites'))

    await expect(reads).resolves.toEqual([
      lists('favorites'),
      lists('favorites'),
    ])
    expect(load).toHaveBeenCalledOnce()
  })

  it('loads again for names a joined load did not cover', async () => {
    const gate = Promise.withResolvers<UserLists>()
    const first = read(['favorites'], () => gate.promise)
    const horror = vi.fn(async () => lists('horror'))
    const second = read(['horror'], horror)
    gate.resolve(lists('favorites'))

    await first
    await expect(second).resolves.toEqual(lists('favorites', 'horror'))
    expect(horror).toHaveBeenCalledOnce()
  })

  it('keeps the cached lists when a load finds nothing', async () => {
    await read(['favorites'], async () => lists('favorites'))

    await expect(read(['horror'], async () => null)).resolves.toBeUndefined()
    await expect(read(['favorites'], async () => lists())).resolves.toEqual(
      lists('favorites'),
    )
  })

  it('answers a load the user was dropped during but never stores it', async () => {
    const gate = Promise.withResolvers<UserLists>()
    const pending = read(['favorites'], () => gate.promise)
    cache.delete(1)
    gate.resolve(lists('favorites'))

    await expect(pending).resolves.toEqual(lists('favorites'))
    expect(cache.get(1)).toBeUndefined()
  })
})
