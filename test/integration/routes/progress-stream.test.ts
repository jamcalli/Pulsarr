import type { ProgressEvent } from '@root/types/progress.types.js'
import type { FastifyInstance } from 'fastify'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedAll } from '../../helpers/seeds/index.js'

const STATUS_IDS = [
  'watchlist-workflow-status',
  'plex-sse-status',
  'discord-status',
  'plex-mobile-status',
  'apprise-status',
]

describe('progress stream', { timeout: 30_000 }, () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await build()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await resetDatabase()
    await seedAll(getTestDatabase())
    app.config.authenticationMethod = 'disabled'
  })

  afterEach(() => {
    app.progress.removeConnection('test-connection')
  })

  it('snapshots cover every status domain with stable ids', () => {
    const snapshots = app.progress.getSnapshots()
    const ids = snapshots.map((event) => event.operationId)

    for (const id of STATUS_IDS) {
      expect(ids).toContain(id)
    }
    for (const event of snapshots) {
      expect(event.type).toBe('system')
      expect(event.metadata).toBeDefined()
      expect(event.metadata && 'status' in event.metadata).toBe(true)
    }
  })

  it('streams snapshots to a connecting client, then stays quiet', async () => {
    await app.listen({ port: 0, host: '127.0.0.1' })
    const address = app.server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Expected a bound TCP address')
    }

    const controller = new AbortController()
    const response = await fetch(
      `http://127.0.0.1:${address.port}/v1/progress`,
      { signal: controller.signal, headers: { accept: 'text/event-stream' } },
    )
    expect(response.status).toBe(200)
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Expected a readable stream body')

    const decoder = new TextDecoder()
    let buffer = ''
    const deadline = Date.now() + 5000
    while (
      !STATUS_IDS.every((id) => buffer.includes(`"operationId":"${id}"`)) &&
      Date.now() < deadline
    ) {
      let timer: NodeJS.Timeout | undefined
      const result = await Promise.race([
        reader.read(),
        new Promise<'deadline'>((resolve) => {
          timer = setTimeout(() => resolve('deadline'), deadline - Date.now())
        }),
      ])
      clearTimeout(timer)
      if (result === 'deadline') break
      const { value, done } = result
      if (done) break
      buffer += decoder.decode(value, { stream: true })
    }

    for (const id of STATUS_IDS) {
      expect(buffer).toContain(`"operationId":"${id}"`)
    }

    // idle stream must carry no further data events
    const idleRead = reader.read().then(({ value }) => {
      return value ? decoder.decode(value) : ''
    })
    const idleChunk = await Promise.race([
      idleRead,
      new Promise<'silent'>((resolve) =>
        setTimeout(() => resolve('silent'), 1_200),
      ),
    ])
    expect(idleChunk).toBe('silent')

    controller.abort()
    await reader.cancel().catch(() => {})
  })

  it('config writes emit notification status transitions', async () => {
    app.progress.addConnection('test-connection')
    const received: ProgressEvent[] = []
    const listener = (event: ProgressEvent) => {
      received.push(event)
    }
    app.progress.getEventEmitter().on('progress', listener)

    try {
      const res = await app.inject({
        method: 'PUT',
        url: '/v1/config',
        payload: { plexMobileEnabled: false },
      })
      expect(res.statusCode).toBe(200)

      const ids = received.map((event) => event.operationId)
      expect(ids).toContain('discord-status')
      expect(ids).toContain('plex-mobile-status')
      expect(ids).toContain('apprise-status')
    } finally {
      app.progress.getEventEmitter().off('progress', listener)
    }
  })

  it('emits intermediate workflow transitions during start and stop', async () => {
    app.progress.addConnection('test-connection')
    const statuses: string[] = []
    const listener = (event: ProgressEvent) => {
      if (
        event.operationId === 'watchlist-workflow-status' &&
        event.metadata &&
        'status' in event.metadata
      ) {
        statuses.push(event.metadata.status)
      }
    }
    app.progress.getEventEmitter().on('progress', listener)

    // the app booted against an unseeded DB, so runtime config lacks the seed tokens
    await app.updateConfig({ plexTokens: ['test_plex_token_1234567890'] })

    try {
      const startRes = await app.inject({
        method: 'POST',
        url: '/v1/watchlist-workflow/start',
        payload: {},
      })
      expect(startRes.statusCode).toBe(200)
      expect(statuses).toContain('starting')
      expect(statuses).toContain('running')

      const stopRes = await app.inject({
        method: 'POST',
        url: '/v1/watchlist-workflow/stop',
      })
      expect(stopRes.statusCode).toBe(200)
      expect(statuses).toContain('stopping')
      expect(statuses).toContain('stopped')
    } finally {
      app.progress.getEventEmitter().off('progress', listener)
      if (['starting', 'running'].includes(app.watchlistWorkflow.getStatus())) {
        await app.watchlistWorkflow.stop().catch(() => {})
      }
    }
  })

  it('emits no status events without a trigger', async () => {
    app.progress.addConnection('test-connection')
    const received: ProgressEvent[] = []
    const listener = (event: ProgressEvent) => {
      if (event.type === 'system') received.push(event)
    }
    app.progress.getEventEmitter().on('progress', listener)

    try {
      await new Promise((resolve) => setTimeout(resolve, 1_300))
      expect(received).toHaveLength(0)
    } finally {
      app.progress.getEventEmitter().off('progress', listener)
    }
  })
})
