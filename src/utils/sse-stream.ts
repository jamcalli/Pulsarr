import type { EventMessage } from 'fastify-sse-v2'

const KEEP_ALIVE_INTERVAL = 30_000

export interface SseStreamOptions<T> {
  signal: AbortSignal
  /** Resolves with the next live item, or undefined when the stream is finished */
  next: () => Promise<T | undefined>
  serialize: (item: T) => EventMessage
  /** Items replayed to the client before live events (snapshots, tail lines) */
  replay?: () => T[] | Promise<T[]>
  keepAliveMs?: number
}

/**
 * Shared SSE source: replays initial items, then live items, yielding comment
 * keep-alives while idle so proxies do not reap the connection. A pending
 * next() survives keep-alive ticks - re-invoking it each tick would drop
 * events or accumulate listeners.
 */
export async function* sseStream<T>(
  options: SseStreamOptions<T>,
): AsyncGenerator<EventMessage> {
  const keepAliveMs = options.keepAliveMs ?? KEEP_ALIVE_INTERVAL

  try {
    if (options.replay) {
      for (const item of await options.replay()) {
        yield options.serialize(item)
      }
    }

    let pending: Promise<T | undefined> | null = null
    while (!options.signal.aborted) {
      pending ??= options.next()

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
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return
    }
    throw error
  }
}
