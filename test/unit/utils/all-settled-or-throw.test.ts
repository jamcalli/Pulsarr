import { allSettledOrThrow } from '@utils/all-settled-or-throw.js'
import { describe, expect, it } from 'vitest'
import { createDeferred } from '../../helpers/deferred.js'

describe('allSettledOrThrow', () => {
  it('resolves every value in input order', async () => {
    const [count, label] = await allSettledOrThrow([
      Promise.resolve(1),
      Promise.resolve('a'),
    ])

    expect(count).toBe(1)
    expect(label).toBe('a')
  })

  it('waits for the other promises to settle before rejecting', async () => {
    const slow = createDeferred<number>()
    let rejected = false
    const run = allSettledOrThrow([
      Promise.reject(new Error('first')),
      slow.promise,
    ]).catch((error: Error) => {
      rejected = true
      throw error
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(rejected).toBe(false)

    slow.resolve(2)

    await expect(run).rejects.toThrow('first')
  })

  it('rethrows the first rejection in input order', async () => {
    const late = createDeferred<number>()
    const run = allSettledOrThrow([
      late.promise,
      Promise.reject(new Error('second')),
    ])
    late.reject(new Error('first'))

    await expect(run).rejects.toThrow('first')
  })
})
