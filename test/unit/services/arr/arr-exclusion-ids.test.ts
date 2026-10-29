import {
  ArrExclusionIds,
  type ArrExclusions,
} from '@services/arr/arr-exclusion-ids.js'
import { describe, expect, it, vi } from 'vitest'

function excluded(...ids: number[]): ArrExclusions<string> {
  return { items: ids.map((id) => `item ${id}`), ids: new Set(ids) }
}

describe('ArrExclusionIds', () => {
  it('shares one pending load between concurrent reads', async () => {
    const gate = Promise.withResolvers<ArrExclusions<string>>()
    const load = vi.fn(() => gate.promise)
    const ids = new ArrExclusionIds(load)

    const reads = Promise.all([ids.has(1), ids.has(2)])
    gate.resolve(excluded(1))

    await expect(reads).resolves.toEqual([true, false])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('serves the id check and the item list from one load within the TTL', async () => {
    const load = vi.fn(async () => excluded(1, 2))
    const exclusions = new ArrExclusionIds(load)

    await expect(exclusions.has(2)).resolves.toBe(true)
    await expect(exclusions.items()).resolves.toEqual(['item 1', 'item 2'])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('keeps a pending load shared past the TTL', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const gate = Promise.withResolvers<ArrExclusions<string>>()
      const load = vi.fn(() => gate.promise)
      const ids = new ArrExclusionIds(load)

      const first = ids.has(1)
      vi.advanceTimersByTime(31_000)
      const second = ids.has(1)
      gate.resolve(excluded(1))

      await expect(Promise.all([first, second])).resolves.toEqual([true, true])
      expect(load).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('reloads once the TTL has passed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const load = vi.fn(async () => excluded(1))
      const ids = new ArrExclusionIds(load)

      await ids.has(1)
      await ids.has(1)
      vi.advanceTimersByTime(30_001)
      await ids.has(1)

      expect(load).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('retries after a failed load', async () => {
    const load = vi
      .fn<() => Promise<ArrExclusions<string>>>()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(excluded(1))
    const ids = new ArrExclusionIds(load)

    await expect(ids.has(1)).rejects.toThrow('down')
    await expect(ids.has(1)).resolves.toBe(true)
  })
})
