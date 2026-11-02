import { CacheRegistry } from '@services/cache-registry.service.js'
import { describe, expect, it } from 'vitest'

describe('CacheRegistry', () => {
  it('creates caches with the given options', () => {
    const cache = new CacheRegistry().create<string, number>({ max: 1 })

    cache.set('a', 1)
    cache.set('b', 2)

    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe(2)
  })

  it('clears every cache it created', () => {
    const registry = new CacheRegistry()
    const first = registry.create<string, number>({ max: 10 })
    const second = registry.create<number, string>({ max: 10 })
    first.set('a', 1)
    second.set(1, 'a')

    registry.clear()

    expect(first.size).toBe(0)
    expect(second.size).toBe(0)
  })

  it('drives TTLs from its clock', () => {
    let now = 1
    const cache = new CacheRegistry({ now: () => now }).create<string, number>({
      max: 10,
      ttl: 100,
    })
    cache.set('a', 1)

    now += 100
    expect(cache.get('a')).toBe(1)
    now += 1
    expect(cache.get('a')).toBeUndefined()
  })
})
