import type { LogEntry } from '@schemas/logs/logs.schema.js'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedAll } from '../../helpers/seeds/index.js'

function logEntry(message: string): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level: 'info',
    message,
  }
}

describe('log stream', { timeout: 30_000 }, () => {
  let app: FastifyInstance
  let baseUrl: string

  beforeAll(async () => {
    app = await build()
    await app.ready()
    await app.listen({ port: 0, host: '127.0.0.1' })
    const address = app.server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Expected a bound TCP address')
    }
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await resetDatabase()
    await seedAll(getTestDatabase())
    app.config.authenticationMethod = 'disabled'
  })

  async function readUntil(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    predicate: (buffer: string) => boolean,
    timeoutMs = 5_000,
  ): Promise<string> {
    const decoder = new TextDecoder()
    let buffer = ''
    const deadline = Date.now() + timeoutMs
    while (!predicate(buffer) && Date.now() < deadline) {
      const result = await Promise.race([
        reader.read(),
        new Promise<'timeout'>((resolve) =>
          setTimeout(() => resolve('timeout'), deadline - Date.now()),
        ),
      ])
      if (result === 'timeout' || result.done) break
      buffer += decoder.decode(result.value, { stream: true })
    }
    return buffer
  }

  it('delivers live entries and applies the text filter', async () => {
    const controller = new AbortController()
    const response = await fetch(
      `${baseUrl}/v1/logs/stream?tail=0&follow=true&filter=wanted`,
      { signal: controller.signal, headers: { accept: 'text/event-stream' } },
    )
    expect(response.status).toBe(200)
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Expected a readable stream body')

    const emitter = app.logStreaming.getEventEmitter()
    // alternate ticks: same-tick pairs would land the second entry in the
    // lossy once() window before the listener re-arms
    let tick = 0
    const feed = setInterval(() => {
      emitter.emit(
        'log',
        logEntry(tick % 2 === 0 ? 'filtered out' : 'wanted entry'),
      )
      tick++
    }, 50)

    let buffer: string
    try {
      buffer = await readUntil(reader, (b) => b.includes('wanted entry'))
    } finally {
      clearInterval(feed)
      controller.abort()
      await reader.cancel().catch(() => {})
    }

    expect(buffer).toContain('wanted entry')
    expect(buffer).not.toContain('filtered out')
  })

  it('ends the stream after replay when follow is false', async () => {
    const controller = new AbortController()
    const response = await fetch(
      `${baseUrl}/v1/logs/stream?tail=0&follow=false`,
      {
        signal: controller.signal,
        headers: { accept: 'text/event-stream' },
      },
    )
    expect(response.status).toBe(200)

    // stream must terminate on its own, not hang until timeout
    const body = await Promise.race([
      response.text(),
      new Promise<'hung'>((resolve) =>
        setTimeout(() => resolve('hung'), 10_000),
      ),
    ])
    if (body === 'hung') {
      controller.abort()
    }
    expect(body).not.toBe('hung')
  })
})
