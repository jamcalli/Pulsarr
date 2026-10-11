import type {
  ContentItem,
  RoutingContext,
  RoutingDecision,
} from '@root/types/router.types.js'
import {
  applyPreRoutingGates,
  type GateParams,
} from '@services/content-router/gates.js'
import { describe, expect, it, vi } from 'vitest'
import {
  type ContentRouterDepsOverrides,
  createContentRouterDeps,
} from '../../../mocks/content-router-deps.js'

const item: ContentItem = {
  title: 'Test Movie',
  type: 'movie',
  guids: ['tmdb:1'],
}

const context: RoutingContext = {
  userId: 1,
  userName: 'User 1',
  contentType: 'movie',
  itemKey: 'key',
}

const decision: RoutingDecision = {
  instanceId: 1,
  qualityProfile: null,
  rootFolder: null,
  tags: [],
  priority: 50,
}

const params = (overrides: Partial<GateParams> = {}): GateParams => ({
  item,
  context,
  decisions: [decision],
  syncedInstances: undefined,
  ...overrides,
})

const quota = (overrides = {}) => ({
  hasQuota: true,
  consumed: true,
  currentUsage: 1,
  quotaLimit: 5,
  quotaType: 'daily',
  userBypassEnabled: false,
  ...overrides,
})

function gateDeps(overrides: ContentRouterDepsOverrides = {}) {
  const createApprovalRequest = vi.fn().mockResolvedValue(undefined)
  const tryConsumeQuota = vi.fn().mockResolvedValue(quota())
  const sendWatchlistCapReached = vi.fn()
  const deps = createContentRouterDeps({
    rules: { get: vi.fn().mockResolvedValue([]) },
    approvalService: { createApprovalRequest },
    quotaService: { tryConsumeQuota },
    notifications: { sendWatchlistCapReached },
    ...overrides,
    db: {
      getApprovalRequestByContent: vi.fn().mockResolvedValue(null),
      getUserQuota: vi.fn().mockResolvedValue(null),
      getUser: vi
        .fn()
        .mockResolvedValue({ id: 1, name: 'User 1', requires_approval: false }),
      ...overrides.db,
    },
  })
  return {
    deps,
    createApprovalRequest,
    tryConsumeQuota,
    sendWatchlistCapReached,
  }
}

describe('applyPreRoutingGates', () => {
  it('lets sync through without reading anything', async () => {
    const { deps } = gateDeps()

    expect(
      await applyPreRoutingGates(
        params({ context: { ...context, syncing: true } }),
        deps,
      ),
    ).toEqual({ action: 'proceed' })
    expect(deps.db.getApprovalRequestByContent).not.toHaveBeenCalled()
  })

  it('stops on an existing pending request', async () => {
    const { deps } = gateDeps({
      db: {
        getApprovalRequestByContent: vi
          .fn()
          .mockResolvedValue({ status: 'pending' }),
      },
    })

    expect(await applyPreRoutingGates(params(), deps)).toEqual({
      action: 'handled',
      result: { routedInstances: [], routingDetails: [] },
    })
  })

  it('blocks and notifies when the watchlist cap is exceeded', async () => {
    const { deps, sendWatchlistCapReached, tryConsumeQuota } = gateDeps({
      db: {
        getUserQuota: vi.fn().mockResolvedValue({ watchlistCap: 2 }),
        getWatchlistUsage: vi.fn().mockResolvedValue(3),
      },
    })

    expect(await applyPreRoutingGates(params(), deps)).toEqual({
      action: 'blocked',
    })
    expect(sendWatchlistCapReached).toHaveBeenCalledWith({
      userId: 1,
      userName: 'User 1',
      contentType: 'movie',
      currentCount: 3,
      cap: 2,
    })
    expect(tryConsumeQuota).not.toHaveBeenCalled()
  })

  it('proceeds without consuming quota when there are no decisions', async () => {
    const { deps, tryConsumeQuota } = gateDeps()

    expect(await applyPreRoutingGates(params({ decisions: [] }), deps)).toEqual(
      { action: 'proceed' },
    )
    expect(tryConsumeQuota).not.toHaveBeenCalled()
  })

  it('writes an approval request when the user requires approval', async () => {
    const { deps, createApprovalRequest, tryConsumeQuota } = gateDeps({
      db: {
        getUser: vi.fn().mockResolvedValue({
          id: 1,
          name: 'User 1',
          requires_approval: true,
        }),
      },
    })

    expect(
      await applyPreRoutingGates(params({ syncedInstances: [2] }), deps),
    ).toEqual({ action: 'blocked' })
    expect(createApprovalRequest).toHaveBeenCalledWith(
      { id: 1, name: 'User 1' },
      item,
      expect.objectContaining({
        approval: expect.objectContaining({
          proposedRouting: expect.objectContaining({
            instanceId: 1,
            syncedInstances: [2],
          }),
        }),
      }),
      'manual_flag',
      expect.any(String),
      undefined,
      'key',
      undefined,
    )
    expect(tryConsumeQuota).not.toHaveBeenCalled()
  })

  it('consumes quota and proceeds', async () => {
    const { deps, tryConsumeQuota } = gateDeps()

    expect(await applyPreRoutingGates(params(), deps)).toEqual({
      action: 'proceed',
    })
    expect(tryConsumeQuota).toHaveBeenCalledWith(1, 'movie')
  })

  it('writes a quota approval request when the quota is exhausted', async () => {
    const { deps, createApprovalRequest } = gateDeps({
      quotaService: {
        tryConsumeQuota: vi
          .fn()
          .mockResolvedValue(quota({ consumed: false, currentUsage: 5 })),
      },
    })

    expect(await applyPreRoutingGates(params(), deps)).toEqual({
      action: 'blocked',
    })
    expect(createApprovalRequest).toHaveBeenCalledWith(
      expect.anything(),
      item,
      expect.anything(),
      'quota_exceeded',
      'daily quota exceeded (6/5)',
      undefined,
      'key',
    )
  })

  it('proceeds past an exhausted quota for a bypass user', async () => {
    const { deps, createApprovalRequest } = gateDeps({
      quotaService: {
        tryConsumeQuota: vi
          .fn()
          .mockResolvedValue(
            quota({ consumed: false, userBypassEnabled: true }),
          ),
      },
    })

    expect(await applyPreRoutingGates(params(), deps)).toEqual({
      action: 'proceed',
    })
    expect(createApprovalRequest).not.toHaveBeenCalled()
  })

  it.each(['getApprovalRequestByContent', 'getUserQuota', 'getUser'] as const)(
    'fails closed when %s throws',
    async (method) => {
      const { deps, createApprovalRequest, tryConsumeQuota } = gateDeps({
        db: { [method]: vi.fn().mockRejectedValue(new Error('db')) },
      })

      await expect(applyPreRoutingGates(params(), deps)).rejects.toThrow('db')
      expect(tryConsumeQuota).not.toHaveBeenCalled()
      expect(createApprovalRequest).not.toHaveBeenCalled()
    },
  )
})
