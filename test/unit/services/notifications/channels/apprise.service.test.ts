import type { AppriseStatus } from '@root/types/notification.types.js'
import { AppriseService } from '@services/notifications/channels/apprise.service.js'
import type { FastifyInstance } from 'fastify'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'
import { server } from '../../../../setup/msw-setup.js'

const FIRST_BASE = 'http://apprise-one.test:8000'
const SECOND_BASE = 'http://apprise-two.test:8000'

interface AppriseServer {
  up: boolean
  pings: number
}

function mockAppriseServer(base: string, up: boolean): AppriseServer {
  const state: AppriseServer = { up, pings: 0 }
  server.use(
    http.get(`${base}/`, () => {
      state.pings++
      return new HttpResponse(null, { status: state.up ? 200 : 503 })
    }),
    http.get(`${base}/details/`, () => HttpResponse.json({ schemas: [] })),
  )
  return state
}

function createService(appriseUrl: string) {
  const config = { appriseUrl, enableApprise: false }
  const fastify = {
    get config() {
      return config
    },
    updateConfig: vi.fn(async (patch: Partial<typeof config>) =>
      Object.assign(config, patch),
    ),
  } as unknown as FastifyInstance
  const service = new AppriseService(createMockLogger(), fastify)
  return { service, config }
}

describe('AppriseService probe', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'Date',
      ],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('enables Apprise when the first ping answers', async () => {
    mockAppriseServer(FIRST_BASE, true)
    const { service } = createService(FIRST_BASE)

    await service.initialize()

    expect(await service.whenReady()).toBe(true)
    expect(service.getStatus()).toBe('enabled')
    service.shutdown()
  })

  it('sends nothing and resolves not ready without a URL', async () => {
    let requests = 0
    server.use(
      http.all('*', () => {
        requests++
        return new HttpResponse(null)
      }),
    )
    const { service } = createService('')

    await service.initialize()
    await vi.advanceTimersByTimeAsync(120_000)

    expect(await service.whenReady()).toBe(false)
    expect(service.getStatus()).toBe('not_configured')
    expect(requests).toBe(0)
  })

  it('resolves not ready after 30 seconds, then enables on a later retry', async () => {
    const apprise = mockAppriseServer(FIRST_BASE, false)
    const { service } = createService(FIRST_BASE)

    await service.initialize()
    const ready = service.whenReady()
    await vi.advanceTimersByTimeAsync(30_000)

    expect(await ready).toBe(false)
    expect(service.getStatus()).toBe('unreachable')

    apprise.up = true
    await vi.advanceTimersByTimeAsync(60_000)

    expect(service.getStatus()).toBe('enabled')
    service.shutdown()
  })

  it('pings a new URL right away and drops the old one', async () => {
    const first = mockAppriseServer(FIRST_BASE, false)
    const second = mockAppriseServer(SECOND_BASE, true)
    const { service, config } = createService(FIRST_BASE)

    await service.initialize()
    await vi.advanceTimersByTimeAsync(30_000)
    const firstPings = first.pings

    config.appriseUrl = SECOND_BASE
    await service.applyConfigChange()
    await vi.advanceTimersByTimeAsync(0)

    expect(second.pings).toBe(1)
    expect(service.getStatus()).toBe('enabled')

    await vi.advanceTimersByTimeAsync(180_000)
    expect(first.pings).toBe(firstPings)
    service.shutdown()
  })

  it('stops probing once the URL is cleared', async () => {
    const apprise = mockAppriseServer(FIRST_BASE, false)
    const { service, config } = createService(FIRST_BASE)

    await service.initialize()
    await vi.advanceTimersByTimeAsync(30_000)
    const pings = apprise.pings

    config.appriseUrl = ''
    await service.applyConfigChange()
    await vi.advanceTimersByTimeAsync(180_000)

    expect(service.getStatus()).toBe('not_configured')
    expect(apprise.pings).toBe(pings)
  })

  it('stops pinging on shutdown', async () => {
    const apprise = mockAppriseServer(FIRST_BASE, false)
    const { service } = createService(FIRST_BASE)

    await service.initialize()
    await vi.advanceTimersByTimeAsync(5_000)
    const pings = apprise.pings

    service.shutdown()
    await vi.advanceTimersByTimeAsync(180_000)

    expect(apprise.pings).toBe(pings)
  })

  it('still enables Apprise when the status listener throws', async () => {
    mockAppriseServer(FIRST_BASE, true)
    const { service } = createService(FIRST_BASE)
    service.onStatusChange(() => {
      throw new Error('listener failed')
    })

    await service.initialize()

    expect(await service.whenReady()).toBe(true)
    expect(service.getStatus()).toBe('enabled')
    service.shutdown()
  })

  it('reports each status transition', async () => {
    const apprise = mockAppriseServer(FIRST_BASE, false)
    const { service, config } = createService(FIRST_BASE)
    const statuses: AppriseStatus[] = []
    service.onStatusChange(() => statuses.push(service.getStatus()))

    await service.initialize()
    await vi.advanceTimersByTimeAsync(30_000)
    apprise.up = true
    await vi.advanceTimersByTimeAsync(60_000)
    config.appriseUrl = ''
    await service.applyConfigChange()

    expect(statuses).toEqual(['unreachable', 'enabled', 'not_configured'])
  })
})
