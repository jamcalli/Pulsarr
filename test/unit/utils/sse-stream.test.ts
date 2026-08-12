import { sseStream } from '@utils/sse-stream.js'
import { describe, expect, it } from 'vitest'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// Controllable event source: push() feeds values to whatever next() is pending
function makeSource<T>() {
  const waiting: Deferred<T | undefined>[] = []
  const queued: Array<{ value: T | undefined }> = []
  let nextCalls = 0

  return {
    next: (): Promise<T | undefined> => {
      nextCalls++
      const entry = queued.shift()
      if (entry) {
        return Promise.resolve(entry.value)
      }
      const d = deferred<T | undefined>()
      waiting.push(d)
      return d.promise
    },
    push: (value: T | undefined) => {
      const d = waiting.shift()
      if (d) {
        d.resolve(value)
      } else {
        queued.push({ value })
      }
    },
    fail: (error: unknown) => {
      const d = waiting.shift()
      if (d) {
        d.reject(error)
      }
    },
    get nextCalls() {
      return nextCalls
    },
  }
}

const serialize = (value: string) => ({ data: value })

describe('sseStream', () => {
  it('replays initial items before live events', async () => {
    const source = makeSource<string>()
    const stream = sseStream<string>({
      signal: new AbortController().signal,
      replay: () => ['a', 'b'],
      next: source.next,
      serialize,
    })

    expect((await stream.next()).value).toEqual({ data: 'a' })
    expect((await stream.next()).value).toEqual({ data: 'b' })

    source.push('c')
    expect((await stream.next()).value).toEqual({ data: 'c' })

    await stream.return(undefined)
  })

  it('awaits a promise-returning replay and keeps live events queued behind it', async () => {
    const source = makeSource<string>()
    const replayGate = deferred<string[]>()
    const stream = sseStream<string>({
      signal: new AbortController().signal,
      replay: () => replayGate.promise,
      next: source.next,
      serialize,
    })

    // live event arriving while replay is still pending must not be lost
    source.push('c')
    replayGate.resolve(['a', 'b'])

    expect((await stream.next()).value).toEqual({ data: 'a' })
    expect((await stream.next()).value).toEqual({ data: 'b' })
    expect((await stream.next()).value).toEqual({ data: 'c' })

    await stream.return(undefined)
  })

  it('emits keep-alive comments while idle without re-invoking next()', async () => {
    const source = makeSource<string>()
    const stream = sseStream<string>({
      signal: new AbortController().signal,
      next: source.next,
      serialize,
      keepAliveMs: 20,
    })

    expect((await stream.next()).value).toEqual({ comment: 'keep-alive' })
    expect((await stream.next()).value).toEqual({ comment: 'keep-alive' })
    expect(source.nextCalls).toBe(1)

    // the original pending next() must still deliver
    source.push('late')
    expect((await stream.next()).value).toEqual({ data: 'late' })

    await stream.return(undefined)
  })

  it('ends when next() resolves undefined', async () => {
    const source = makeSource<string>()
    const stream = sseStream<string>({
      signal: new AbortController().signal,
      next: source.next,
      serialize,
    })

    source.push(undefined)
    expect((await stream.next()).done).toBe(true)
  })

  it('ends cleanly when next() rejects with an AbortError', async () => {
    const source = makeSource<string>()
    const stream = sseStream<string>({
      signal: new AbortController().signal,
      next: source.next,
      serialize,
    })

    const consume = stream.next()
    const abortError = new Error('aborted')
    abortError.name = 'AbortError'
    source.fail(abortError)

    expect((await consume).done).toBe(true)
  })

  it('rethrows non-abort errors', async () => {
    const source = makeSource<string>()
    const stream = sseStream<string>({
      signal: new AbortController().signal,
      next: source.next,
      serialize,
    })

    const consume = stream.next()
    source.fail(new Error('boom'))

    await expect(consume).rejects.toThrow('boom')
  })

  it('stops looping once the signal is aborted', async () => {
    const controller = new AbortController()
    const source = makeSource<string>()
    const stream = sseStream<string>({
      signal: controller.signal,
      next: source.next,
      serialize,
    })

    source.push('first')
    expect((await stream.next()).value).toEqual({ data: 'first' })

    controller.abort()
    source.push('after-abort')
    expect((await stream.next()).done).toBe(true)
  })
})
