import { SchedulerService } from '@services/scheduler.service.js'
import { WebhookQueueService } from '@services/webhook-queue.service.js'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'
import { createScheduleDb } from '../../mocks/schedule-db.js'

const RETRY_INTERVAL_SECONDS = 20

describe('WebhookQueueService', () => {
  let scheduler: SchedulerService
  let service: WebhookQueueService

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'))
  })

  afterEach(() => {
    service.shutdown()
    scheduler.stop()
    vi.useRealTimers()
  })

  it('retries pending webhooks on its configured interval on a fresh install', async () => {
    const getPendingWebhooks = vi.fn().mockResolvedValue([])
    const db = { ...createScheduleDb(), getPendingWebhooks }
    const fastify = {
      db,
      config: {},
      caches: { create: vi.fn(() => new Map()) },
      notifications: { apprise: { whenReady: () => new Promise(() => {}) } },
      progress: { hasActiveConnections: () => false, emit: vi.fn() },
    } as unknown as FastifyInstance
    scheduler = new SchedulerService(createMockLogger(), fastify)
    fastify.scheduler = scheduler
    service = new WebhookQueueService(createMockLogger(), fastify, {
      retryInterval: RETRY_INTERVAL_SECONDS,
    })

    await service.initialize()
    getPendingWebhooks.mockClear()
    await vi.advanceTimersByTimeAsync((RETRY_INTERVAL_SECONDS + 1) * 1000)

    expect(getPendingWebhooks).toHaveBeenCalled()
  })
})
