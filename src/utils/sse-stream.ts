import type { EventEmitter } from 'node:events'
import type { EventMessage } from 'fastify-sse-v2'

const KEEP_ALIVE_INTERVAL = 30_000
const MAX_BUFFERED_ITEMS = 1000

interface SseLiveSource<T> {
  emitter: EventEmitter
  event: string
  filter?: (item: T) => boolean
  /** Oldest items drop past this many queued against a slow client */
  maxBuffered?: number
}

export interface SseStreamOptions<T> {
  signal: AbortSignal
  serialize: (item: T) => EventMessage
  /** Items replayed to the client before live events (snapshots, tail lines) */
  replay?: () => T[] | Promise<T[]>
  /** Without a live source the stream ends after replay */
  live?: SseLiveSource<T>
  keepAliveMs?: number
}

/** Subscribes to the live emitter at call time, before replay runs, so nothing emitted in between is lost. */
export function sseStream<T>(
  options: SseStreamOptions<T>,
): AsyncGenerator<EventMessage> {
  const { signal, live } = options
  const keepAliveMs = options.keepAliveMs ?? KEEP_ALIVE_INTERVAL
  const maxBuffered = live?.maxBuffered ?? MAX_BUFFERED_ITEMS

  // the emitter delivers a whole burst synchronously, so items queue between yields
  const buffered: T[] = []
  let wake: (() => void) | null = null
  const onItem = (item: T) => {
    if (live?.filter && !live.filter(item)) return
    buffered.push(item)
    if (buffered.length > maxBuffered) buffered.shift()
    wake?.()
  }
  const unsubscribe = () => {
    if (!live) return
    live.emitter.off(live.event, onItem)
    signal.removeEventListener('abort', onAbort)
  }
  const onAbort = () => {
    unsubscribe()
    wake?.()
  }

  if (live) {
    live.emitter.on(live.event, onItem)
    signal.addEventListener('abort', onAbort, { once: true })
  }

  const next = async (): Promise<T | undefined> => {
    while (!signal.aborted) {
      const item = buffered.shift()
      if (item !== undefined) return item
      await new Promise<void>((resolve) => {
        wake = resolve
      })
      wake = null
    }
    return undefined
  }

  return generate()

  async function* generate(): AsyncGenerator<EventMessage> {
    try {
      if (options.replay) {
        for (const item of await options.replay()) {
          yield options.serialize(item)
        }
      }
      if (!live) return

      let pending: Promise<T | undefined> | null = null
      while (!signal.aborted) {
        pending ??= next()

        let keepAliveTimer: NodeJS.Timeout | null = null
        const keepAlive = new Promise<'keepalive'>((resolve) => {
          keepAliveTimer = setTimeout(() => resolve('keepalive'), keepAliveMs)
        })

        let result: T | undefined | 'keepalive'
        try {
          result = await Promise.race([pending, keepAlive])
        } finally {
          if (keepAliveTimer) {
            clearTimeout(keepAliveTimer)
          }
        }

        if (result === 'keepalive') {
          yield { comment: 'keep-alive' }
          continue
        }

        pending = null
        if (result === undefined) {
          return
        }
        yield options.serialize(result)
      }
    } finally {
      unsubscribe()
    }
  }
}
