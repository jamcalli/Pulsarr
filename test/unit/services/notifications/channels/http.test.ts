import { postJson } from '@services/notifications/channels/http.js'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../../../../setup/msw-setup.js'

const ENDPOINT = 'http://hooks.test/notify'

function respondWith(...responses: Array<() => Response>) {
  let attempts = 0
  server.use(
    http.post(ENDPOINT, () => {
      const respond = responses[Math.min(attempts, responses.length - 1)]
      attempts += 1
      return respond()
    }),
  )
  return () => attempts
}

const status = (code: number, headers?: Record<string, string>) => () =>
  new HttpResponse(null, { status: code, headers })

async function nextBackoff(ms: number): Promise<void> {
  await vi.waitFor(() => expect(vi.getTimerCount()).toBe(1))
  await vi.advanceTimersByTimeAsync(ms)
}

describe('postJson retry', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('succeeds when a 503 is followed by a 200', async () => {
    const attempts = respondWith(status(503), status(200))

    const result = postJson(ENDPOINT, {}, { timeoutMs: 1000, retry: true })
    await nextBackoff(2_000)

    expect(await result).toEqual({ ok: true, status: 200 })
    expect(attempts()).toBe(2)
  })

  it('fails with the last reason after three 503s', async () => {
    const attempts = respondWith(
      status(503),
      status(503),
      () => new HttpResponse(null, { status: 503, statusText: 'Last Down' }),
    )

    const result = postJson(ENDPOINT, {}, { timeoutMs: 1000, retry: true })
    await nextBackoff(2_000)
    await nextBackoff(10_000)

    expect(await result).toEqual({
      ok: false,
      reason: '503 Last Down',
      status: 503,
    })
    expect(attempts()).toBe(3)
  })

  it('does not retry a 404', async () => {
    const attempts = respondWith(status(404))

    const result = await postJson(
      ENDPOINT,
      {},
      { timeoutMs: 1000, retry: true },
    )

    expect(result).toMatchObject({ ok: false, status: 404 })
    expect(attempts()).toBe(1)
  })

  it('does not retry an Apprise 424', async () => {
    const attempts = respondWith(status(424))

    const result = await postJson(
      ENDPOINT,
      {},
      { timeoutMs: 1000, retry: true },
    )

    expect(result).toMatchObject({ ok: false, status: 424 })
    expect(attempts()).toBe(1)
  })

  it('waits for Retry-After on a 429', async () => {
    const attempts = respondWith(
      status(429, { 'Retry-After': '5' }),
      status(204),
    )

    const result = postJson(ENDPOINT, {}, { timeoutMs: 1000, retry: true })
    await vi.waitFor(() => expect(vi.getTimerCount()).toBe(1))
    await vi.advanceTimersByTimeAsync(4_000)
    expect(attempts()).toBe(1)
    await vi.advanceTimersByTimeAsync(1_000)

    expect(await result).toEqual({ ok: true, status: 204 })
    expect(attempts()).toBe(2)
  })

  it('sends once without the retry option', async () => {
    const attempts = respondWith(status(503))

    const result = await postJson(ENDPOINT, {}, { timeoutMs: 1000 })

    expect(result).toMatchObject({ ok: false, status: 503 })
    expect(attempts()).toBe(1)
  })
})
