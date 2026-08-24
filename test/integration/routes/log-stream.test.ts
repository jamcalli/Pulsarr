import { randomUUID } from 'node:crypto'
import { appendFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { LogEntry } from '@schemas/logs/logs.schema.js'
import { resolveLogPath } from '@utils/data-dir.js'
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

const logFile = resolve(resolveLogPath(), 'pulsarr-current.log')

function pinoLine(msg: string): string {
  return `${JSON.stringify({ level: 30, time: Date.now(), msg })}\n`
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
      let timer: NodeJS.Timeout | undefined
      let result: Awaited<ReturnType<typeof reader.read>> | 'timeout'
      try {
        result = await Promise.race([
          reader.read(),
          new Promise<'timeout'>((resolve) => {
            timer = setTimeout(() => resolve('timeout'), deadline - Date.now())
          }),
        ])
      } finally {
        clearTimeout(timer)
      }
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
    const marker = `replay-${randomUUID()}`
    await mkdir(resolveLogPath(), { recursive: true })
    await appendFile(logFile, pinoLine(`${marker} entry`))

    const controller = new AbortController()
    const response = await fetch(
      `${baseUrl}/v1/logs/stream?tail=1&follow=false`,
      {
        signal: controller.signal,
        headers: { accept: 'text/event-stream' },
      },
    )
    expect(response.status).toBe(200)

    // stream must terminate on its own, not hang until timeout
    let hangTimer: NodeJS.Timeout | undefined
    let body: string
    try {
      body = await Promise.race([
        response.text(),
        new Promise<'hung'>((resolve) => {
          hangTimer = setTimeout(() => resolve('hung'), 10_000)
        }),
      ])
    } finally {
      clearTimeout(hangTimer)
    }
    if (body === 'hung') {
      controller.abort()
    }
    expect(body).not.toBe('hung')
    expect(body).toContain(`${marker} entry`)
  })

  it('applies the filter within the tail window without backfilling older matches', async () => {
    const marker = `tail-window-${randomUUID()}`
    await mkdir(resolveLogPath(), { recursive: true })
    await appendFile(
      logFile,
      pinoLine(`${marker} target`) +
        pinoLine(`${marker} filler 1`) +
        pinoLine(`${marker} filler 2`) +
        pinoLine(`${marker} filler 3`),
    )

    const outsideWindow = await app.logStreaming.getTailLines(
      3,
      `${marker} target`,
    )
    expect(outsideWindow).toHaveLength(0)

    const insideWindow = await app.logStreaming.getTailLines(
      4,
      `${marker} target`,
    )
    expect(insideWindow).toHaveLength(1)
    expect(insideWindow[0].message).toBe(`${marker} target`)
  })
})
