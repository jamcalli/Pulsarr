import { EventEmitter } from 'node:events'
import { sseStream } from '@utils/sse-stream.js'
import { describe, expect, it } from 'vitest'

const serialize = (value: string) => ({ data: value })

function makeStream(options: {
  emitter?: EventEmitter
  signal?: AbortSignal
  replay?: () => string[] | Promise<string[]>
  filter?: (item: string) => boolean
  maxBuffered?: number
  keepAliveMs?: number
}) {
  const emitter = options.emitter ?? new EventEmitter()
  const stream = sseStream<string>({
    signal: options.signal ?? new AbortController().signal,
    replay: options.replay,
    live: {
      emitter,
      event: 'item',
      filter: options.filter,
      maxBuffered: options.maxBuffered,
    },
    serialize,
    keepAliveMs: options.keepAliveMs,
  })
  return { emitter, stream }
}

describe('sseStream', () => {
  it('replays initial items before live events', async () => {
    const { emitter, stream } = makeStream({ replay: () => ['a', 'b'] })

    expect((await stream.next()).value).toEqual({ data: 'a' })
    expect((await stream.next()).value).toEqual({ data: 'b' })

    emitter.emit('item', 'c')
    expect((await stream.next()).value).toEqual({ data: 'c' })

    await stream.return(undefined)
  })

  it('keeps live events emitted during a pending replay', async () => {
    let releaseReplay!: (items: string[]) => void
    const { emitter, stream } = makeStream({
      replay: () =>
        new Promise<string[]>((resolve) => {
          releaseReplay = resolve
        }),
    })

    const first = stream.next()
    emitter.emit('item', 'c')
    releaseReplay(['a', 'b'])

    expect((await first).value).toEqual({ data: 'a' })
    expect((await stream.next()).value).toEqual({ data: 'b' })
    expect((await stream.next()).value).toEqual({ data: 'c' })

    await stream.return(undefined)
  })

  it('delivers every item of a synchronous burst in order', async () => {
    const { emitter, stream } = makeStream({})
    const first = stream.next()
    for (let i = 0; i < 25; i++) {
      emitter.emit('item', `b${i}`)
    }

    expect((await first).value).toEqual({ data: 'b0' })
    for (let i = 1; i < 25; i++) {
      expect((await stream.next()).value).toEqual({ data: `b${i}` })
    }

    await stream.return(undefined)
  })

  it('applies the filter and drops the oldest past the buffer cap', async () => {
    const { emitter, stream } = makeStream({
      filter: (item) => item.startsWith('keep'),
      maxBuffered: 2,
    })

    emitter.emit('item', 'skip-1')
    emitter.emit('item', 'keep-1')
    emitter.emit('item', 'keep-2')
    emitter.emit('item', 'keep-3')

    expect((await stream.next()).value).toEqual({ data: 'keep-2' })
    expect((await stream.next()).value).toEqual({ data: 'keep-3' })

    await stream.return(undefined)
  })

  it('emits keep-alive comments while idle and still delivers a late item', async () => {
    const { emitter, stream } = makeStream({ keepAliveMs: 20 })

    expect((await stream.next()).value).toEqual({ comment: 'keep-alive' })
    expect((await stream.next()).value).toEqual({ comment: 'keep-alive' })

    emitter.emit('item', 'late')
    expect((await stream.next()).value).toEqual({ data: 'late' })

    await stream.return(undefined)
  })

  it('ends after replay when there is no live source', async () => {
    const stream = sseStream<string>({
      signal: new AbortController().signal,
      replay: () => ['only'],
      serialize,
    })

    expect((await stream.next()).value).toEqual({ data: 'only' })
    expect((await stream.next()).done).toBe(true)
  })

  it('stops and unsubscribes once the signal is aborted', async () => {
    const controller = new AbortController()
    const { emitter, stream } = makeStream({ signal: controller.signal })

    emitter.emit('item', 'first')
    expect((await stream.next()).value).toEqual({ data: 'first' })

    const idle = stream.next()
    controller.abort()
    expect((await idle).done).toBe(true)
    expect(emitter.listenerCount('item')).toBe(0)
  })

  it('unsubscribes when the consumer returns early', async () => {
    const { emitter, stream } = makeStream({})
    emitter.emit('item', 'first')
    expect((await stream.next()).value).toEqual({ data: 'first' })

    await stream.return(undefined)
    expect(emitter.listenerCount('item')).toBe(0)
  })
})
