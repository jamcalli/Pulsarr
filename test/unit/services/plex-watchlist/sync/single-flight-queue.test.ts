import { createSingleFlightQueue } from '@services/plex-watchlist/sync/single-flight-queue.js'
import { describe, expect, it, vi } from 'vitest'
import { createDeferred } from '../../../../helpers/deferred.js'

describe('plex-watchlist/sync/single-flight-queue', () => {
  it('joins a run with the same key and does the work once', async () => {
    const queue = createSingleFlightQueue<string>()
    const run = createDeferred<string>()
    const work = vi.fn(() => run.promise)

    const first = queue.run('a', work)
    const second = queue.run('a', work)
    run.resolve('done')

    expect(second).toBe(first)
    await expect(second).resolves.toBe('done')
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('starts a run with a different key only after the in-flight run settles', async () => {
    const queue = createSingleFlightQueue<string>()
    const calls: string[] = []
    const first = createDeferred<string>()
    const second = createDeferred<string>()

    const a = queue.run('a', () => {
      calls.push('start a')
      return first.promise
    })
    const b = queue.run('b', () => {
      calls.push('start b')
      return second.promise
    })
    await Promise.resolve()
    expect(calls).toEqual(['start a'])

    first.resolve('a')
    await expect(a).resolves.toBe('a')
    await vi.waitFor(() => expect(calls).toEqual(['start a', 'start b']))

    second.resolve('b')
    await expect(b).resolves.toBe('b')
  })

  it('starts a queued run after the in-flight run rejects', async () => {
    const queue = createSingleFlightQueue<string>()
    const first = createDeferred<string>()

    const a = queue.run('a', () => first.promise)
    const b = queue.run('b', async () => 'b')
    first.reject(new Error('plex down'))

    await expect(a).rejects.toThrow('plex down')
    await expect(b).resolves.toBe('b')
  })

  it('joins a queued run with the same key', async () => {
    const queue = createSingleFlightQueue<string>()
    const first = createDeferred<string>()
    const work = vi.fn(async () => 'b')

    queue.run('a', () => first.promise)
    const queued = queue.run('b', work)
    const joined = queue.run('b', work)
    first.resolve('a')

    expect(joined).toBe(queued)
    await expect(joined).resolves.toBe('b')
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('clears the slot after a run resolves', async () => {
    const queue = createSingleFlightQueue<string>()
    const work = vi.fn(async () => 'done')

    await queue.run('a', work)
    await queue.run('a', work)

    expect(work).toHaveBeenCalledTimes(2)
  })

  it('rejects every joined caller and clears the slot after a rejection', async () => {
    const queue = createSingleFlightQueue<string>()
    const run = createDeferred<string>()

    const first = queue.run('a', () => run.promise)
    const joined = queue.run('a', async () => 'unused')
    run.reject(new Error('plex down'))

    await expect(first).rejects.toThrow('plex down')
    await expect(joined).rejects.toThrow('plex down')
    await expect(queue.run('a', async () => 'retry')).resolves.toBe('retry')
  })
})
