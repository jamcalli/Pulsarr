import { TmdbRequestQueue } from '@services/tmdb/request-queue.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../mocks/logger.js'

const URL = 'https://api.themoviedb.org/3/movie/550'

function ok(): Response {
  return new Response(null, { status: 200 })
}

function rateLimited(retryAfter?: string): Response {
  return new Response(null, {
    status: 429,
    headers: retryAfter ? { 'retry-after': retryAfter } : undefined,
  })
}

describe('TmdbRequestQueue', () => {
  let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    vi.useFakeTimers()
    // A fixed random keeps the retry jitter at zero so wait times are exact
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    fetchImpl = vi.fn<typeof fetch>()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function createQueue(maxRetries?: number): TmdbRequestQueue {
    return new TmdbRequestQueue(createMockLogger(), { fetchImpl, maxRetries })
  }

  it('resolves with the response', async () => {
    fetchImpl.mockResolvedValueOnce(ok())

    const response = await createQueue().fetch(URL, {})

    expect(response.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('does not start the second request until the first settles', async () => {
    let releaseFirst: (response: Response) => void = () => {}
    fetchImpl
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            releaseFirst = resolve
          }),
      )
      .mockResolvedValueOnce(ok())

    const queue = createQueue()
    const first = queue.fetch(URL, {})
    const second = queue.fetch(URL, {})

    expect(fetchImpl).toHaveBeenCalledTimes(1)

    releaseFirst(ok())
    await first
    await second

    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('honors retry-after on a 429 and retries once the wait elapses', async () => {
    fetchImpl
      .mockResolvedValueOnce(rateLimited('1'))
      .mockResolvedValueOnce(ok())

    const promise = createQueue().fetch(URL, {})

    await vi.advanceTimersByTimeAsync(999)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    await expect(promise).resolves.toMatchObject({ status: 200 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('rejects once the 429 retries are exhausted', async () => {
    fetchImpl.mockResolvedValue(rateLimited('1'))

    const promise = createQueue().fetch(URL, {})
    const rejection = expect(promise).rejects.toThrow(
      'TMDB rate limit exceeded, max retries reached',
    )

    await vi.runAllTimersAsync()
    await rejection
  })

  it('retries a failed request after a backoff', async () => {
    fetchImpl
      .mockImplementationOnce(() => Promise.reject(new Error('network down')))
      .mockResolvedValueOnce(ok())

    const promise = createQueue().fetch(URL, {})

    await vi.advanceTimersByTimeAsync(999)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    await expect(promise).resolves.toMatchObject({ status: 200 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('aborts a request that never settles once the timeout elapses', async () => {
    fetchImpl.mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new Error('The operation was aborted'))
          })
        }),
    )

    const promise = createQueue(0).fetch(URL, {})
    const rejection = expect(promise).rejects.toThrow(
      'The operation was aborted',
    )

    const signal = fetchImpl.mock.calls[0][1]?.signal
    expect(signal?.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(signal?.aborted).toBe(true)

    await rejection
  })
})
