import type { ArrWebhookResult } from '@root/schemas/config/config.schema.js'
import {
  hasCallbackFailure,
  registerArrWebhooks,
  testArrWebhookAddress,
} from '@services/arr-webhook-address.service.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
import type { SonarrManagerService } from '@services/sonarr-manager.service.js'
import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'

function row(overrides: Partial<ArrWebhookResult>): ArrWebhookResult {
  return {
    instanceId: 1,
    name: 'Main',
    success: true,
    code: null,
    message: 'Webhook callback reachable',
    ...overrides,
  }
}

describe('arr webhook address', () => {
  let radarr: {
    testWebhookAddress: Mock<RadarrManagerService['testWebhookAddress']>
    resyncWebhooks: Mock<RadarrManagerService['resyncWebhooks']>
  }
  let sonarr: {
    testWebhookAddress: Mock<SonarrManagerService['testWebhookAddress']>
    resyncWebhooks: Mock<SonarrManagerService['resyncWebhooks']>
  }
  let fastify: FastifyInstance

  beforeEach(() => {
    radarr = {
      testWebhookAddress: vi.fn<RadarrManagerService['testWebhookAddress']>(),
      resyncWebhooks: vi.fn<RadarrManagerService['resyncWebhooks']>(),
    }
    sonarr = {
      testWebhookAddress: vi.fn<SonarrManagerService['testWebhookAddress']>(),
      resyncWebhooks: vi.fn<SonarrManagerService['resyncWebhooks']>(),
    }
    const radarrManager: Partial<RadarrManagerService> = radarr
    const sonarrManager: Partial<SonarrManagerService> = sonarr
    const partial: Partial<FastifyInstance> = {
      radarrManager: radarrManager as RadarrManagerService,
      sonarrManager: sonarrManager as SonarrManagerService,
    }
    fastify = partial as FastifyInstance
  })

  it('tests both arrs at the candidate address', async () => {
    radarr.testWebhookAddress.mockResolvedValue([
      row({
        success: false,
        code: 'callback_failed',
        message: 'Unable to send test message',
      }),
    ])
    sonarr.testWebhookAddress.mockResolvedValue([
      row({
        success: false,
        code: 'unreachable',
        message: 'Bad Gateway',
      }),
    ])

    const results = await testArrWebhookAddress(fastify, {
      baseUrl: 'http://new-host',
      port: 4004,
    })

    expect(radarr.testWebhookAddress).toHaveBeenCalledWith(
      'http://new-host',
      4004,
    )
    expect(sonarr.testWebhookAddress).toHaveBeenCalledWith(
      'http://new-host',
      4004,
    )
    expect(results.radarr[0].message).toBe('Unable to send test message')
    expect(results.sonarr[0].message).toBe('Bad Gateway')
  })

  it('registers both arrs', async () => {
    radarr.resyncWebhooks.mockResolvedValue([
      row({ message: 'Webhook re-registered' }),
    ])
    sonarr.resyncWebhooks.mockResolvedValue([
      row({
        success: false,
        code: 'unreachable',
        message: 'Bad Gateway',
      }),
    ])

    const results = await registerArrWebhooks(fastify)

    expect(results.radarr).toEqual([row({ message: 'Webhook re-registered' })])
    expect(results.sonarr[0].message).toBe('Bad Gateway')
  })

  it('blocks only on a rejected callback', () => {
    expect(
      hasCallbackFailure({
        radarr: [row({})],
        sonarr: [row({ success: false, code: 'unreachable' })],
      }),
    ).toBe(false)
    expect(
      hasCallbackFailure({
        radarr: [row({ success: false, code: 'callback_failed' })],
        sonarr: [],
      }),
    ).toBe(true)
    expect(hasCallbackFailure({ radarr: [], sonarr: [] })).toBe(false)
  })
})
