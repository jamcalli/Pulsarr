import type {
  ContentItem,
  RoutingContext,
  RoutingDetails,
} from '@root/types/router.types.js'
import {
  type AutoApprovalParams,
  createAutoApprovalRecord,
} from '@services/content-router/auto-approval.js'
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
  contentType: 'movie',
  itemKey: 'key',
}

const proposed: RoutingDetails = {
  instanceId: 2,
  instanceType: 'radarr',
  qualityProfile: '4',
  rootFolder: '/movies',
  tags: ['a'],
  searchOnAdd: true,
  minimumAvailability: 'released',
  monitor: 'movieOnly',
}

const params = (
  overrides: Partial<AutoApprovalParams> = {},
): AutoApprovalParams => ({
  item,
  context,
  proposed,
  additional: [],
  syncedInstances: undefined,
  ...overrides,
})

function autoDeps(overrides: ContentRouterDepsOverrides = {}) {
  const createApprovalRequest = vi.fn().mockResolvedValue({ id: 10 })
  const updatedRequest = {
    id: 10,
    userId: 1,
    userName: 'User 1',
    contentTitle: 'Test Movie',
    contentType: 'movie',
    status: 'auto_approved',
  }
  const sendApprovalAuto = vi.fn().mockResolvedValue(undefined)
  const emit = vi.fn()
  const deps = createContentRouterDeps({
    db: {
      getApprovalRequestByContent: vi.fn().mockResolvedValue(null),
      createApprovalRequest,
      updateApprovalRequest: vi.fn().mockResolvedValue(updatedRequest),
      ...overrides.db,
    },
    progress: { hasActiveConnections: vi.fn().mockReturnValue(true), emit },
    notifications: { sendApprovalAuto },
  })
  return { deps, createApprovalRequest, sendApprovalAuto, emit }
}

describe('createAutoApprovalRecord', () => {
  it('records the proposed routing and announces it', async () => {
    const { deps, createApprovalRequest, sendApprovalAuto, emit } = autoDeps()

    await createAutoApprovalRecord(params({ syncedInstances: [3] }), deps)

    expect(createApprovalRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        contentKey: 'key',
        routerDecision: expect.objectContaining({
          approval: expect.objectContaining({
            proposedRouting: expect.objectContaining({
              instanceId: 2,
              qualityProfile: '4',
              priority: 50,
              syncedInstances: [3],
            }),
          }),
        }),
      }),
    )
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'approval-10', phase: 'created' }),
    )
    expect(sendApprovalAuto).toHaveBeenCalledWith(
      expect.objectContaining({ id: 10 }),
      expect.objectContaining({ instanceId: 2, syncedInstances: [3] }),
      'Auto-approved (no approval required)',
    )
  })

  it('stores the rule that drove the routing', async () => {
    const { deps, createApprovalRequest } = autoDeps()

    await createAutoApprovalRecord(
      params({ proposed: { ...proposed, ruleId: 7, ruleName: 'Comedy' } }),
      deps,
    )

    expect(createApprovalRequest).toHaveBeenCalledWith(
      expect.objectContaining({ routerRuleId: 7 }),
    )
    expect(
      createApprovalRequest.mock.calls[0][0].routerDecision.approval
        .proposedRouting.ruleId,
    ).toBe(7)
  })

  it('stores every routing after the first as additional routing', async () => {
    const { deps, createApprovalRequest } = autoDeps()

    await createAutoApprovalRecord(
      params({
        additional: [
          { ...proposed, instanceId: 5, rootFolder: '/b', ruleId: 9 },
        ],
      }),
      deps,
    )

    const decision =
      createApprovalRequest.mock.calls[0][0].routerDecision.approval
    expect(decision.proposedRouting.instanceId).toBe(2)
    expect(decision.additionalRouting).toEqual([
      expect.objectContaining({ instanceId: 5, rootFolder: '/b', ruleId: 9 }),
    ])
  })

  it('stores no additional routing for a single instance', async () => {
    const { deps, createApprovalRequest } = autoDeps()

    await createAutoApprovalRecord(params(), deps)

    const decision =
      createApprovalRequest.mock.calls[0][0].routerDecision.approval
    expect(decision.additionalRouting).toBeUndefined()
  })

  it('stores no rule for default routing', async () => {
    const { deps, createApprovalRequest } = autoDeps()

    await createAutoApprovalRecord(params(), deps)

    expect(createApprovalRequest).toHaveBeenCalledWith(
      expect.objectContaining({ routerRuleId: undefined }),
    )
  })

  it('skips sync operations', async () => {
    const { deps, createApprovalRequest } = autoDeps()

    await createAutoApprovalRecord(
      params({ context: { ...context, syncing: true } }),
      deps,
    )

    expect(createApprovalRequest).not.toHaveBeenCalled()
  })

  it('skips content that already has a request', async () => {
    const { deps, createApprovalRequest } = autoDeps({
      db: { getApprovalRequestByContent: vi.fn().mockResolvedValue({ id: 1 }) },
    })

    await createAutoApprovalRecord(params(), deps)

    expect(createApprovalRequest).not.toHaveBeenCalled()
  })

  it('swallows a failed write', async () => {
    const { deps } = autoDeps({
      db: { createApprovalRequest: vi.fn().mockRejectedValue(new Error('db')) },
    })

    await expect(
      createAutoApprovalRecord(params(), deps),
    ).resolves.toBeUndefined()
  })
})
