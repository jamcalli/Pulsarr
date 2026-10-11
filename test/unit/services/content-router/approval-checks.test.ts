import type { ApprovalRequest } from '@root/types/approval.types.js'
import type {
  ContentItem,
  RoutingContext,
  RoutingDecision,
} from '@root/types/router.types.js'
import {
  approvalRoutingFor,
  checkApprovalRequirements,
  checkExistingApprovalRequest,
} from '@services/content-router/approval-checks.js'
import { describe, expect, it, vi } from 'vitest'
import { echoAppliedRadarr } from '../../../mocks/applied-routing.js'
import { createContentRouterDeps } from '../../../mocks/content-router-deps.js'

const item: ContentItem = {
  title: 'Test Movie',
  type: 'movie',
  guids: ['tmdb:1'],
  genres: ['Drama'],
}

const context: RoutingContext = {
  userId: 1,
  userName: 'User 1',
  contentType: 'movie',
  itemKey: 'key',
}

const ruleDecision = (
  overrides: Partial<RoutingDecision>,
): RoutingDecision => ({
  instanceId: 1,
  priority: 50,
  ruleId: 1,
  ruleName: 'Drama',
  ...overrides,
})

const approvalDeps = (user: object | null = {}) =>
  createContentRouterDeps({
    db: {
      getUser: vi
        .fn()
        .mockResolvedValue(
          user && { id: 1, name: 'User 1', requires_approval: false, ...user },
        ),
    },
  })

describe('checkApprovalRequirements', () => {
  it('requires approval when the first decision demands it', async () => {
    const decisions = [
      ruleDecision({
        ruleId: 7,
        alwaysRequireApproval: true,
        bypassUserQuotas: true,
        approvalReason: 'Drama needs review',
      }),
    ]

    expect(
      await checkApprovalRequirements(context, decisions, approvalDeps()),
    ).toEqual({
      required: true,
      reason: 'Drama needs review',
      trigger: 'router_rule',
      data: {
        ruleId: 7,
        criteriaType: 'router_rule',
        criteriaValue: 'Drama',
        quotasBypassedByRule: true,
      },
    })
  })

  it('requires approval when a lower decision demands it', async () => {
    const decisions = [
      ruleDecision({ ruleId: 1 }),
      ruleDecision({
        ruleId: 2,
        ruleName: 'Lower',
        alwaysRequireApproval: true,
      }),
      ruleDecision({
        ruleId: 3,
        ruleName: 'Lowest',
        alwaysRequireApproval: true,
      }),
    ]

    expect(
      await checkApprovalRequirements(context, decisions, approvalDeps()),
    ).toEqual({
      required: true,
      reason: 'Approval required by router rule: Lower',
      trigger: 'router_rule',
      data: {
        ruleId: 2,
        criteriaType: 'router_rule',
        criteriaValue: 'Lower',
        quotasBypassedByRule: false,
      },
    })
  })

  it('records a quota bypass from any decision', async () => {
    const decisions = [
      ruleDecision({ ruleId: 1 }),
      ruleDecision({ ruleId: 2, bypassUserQuotas: true }),
    ]

    expect(
      await checkApprovalRequirements(context, decisions, approvalDeps()),
    ).toEqual({
      required: false,
      data: { quotasBypassedByRule: true },
    })
  })

  it('needs neither approval nor a bypass from plain decisions', async () => {
    expect(
      await checkApprovalRequirements(
        context,
        [ruleDecision({})],
        approvalDeps(),
      ),
    ).toEqual({
      required: false,
      data: { quotasBypassedByRule: false },
    })
  })

  it('falls back to the user approval flag', async () => {
    expect(
      await checkApprovalRequirements(
        context,
        [],
        approvalDeps({ requires_approval: true }),
      ),
    ).toMatchObject({
      required: true,
      trigger: 'manual_flag',
    })
  })

  it('carries a decision quota bypass on the user approval flag', async () => {
    expect(
      await checkApprovalRequirements(
        context,
        [ruleDecision({ bypassUserQuotas: true })],
        approvalDeps({ requires_approval: true }),
      ),
    ).toMatchObject({
      required: true,
      trigger: 'manual_flag',
      data: { quotasBypassedByRule: true },
    })
  })

  it('never requires approval while syncing', async () => {
    expect(
      await checkApprovalRequirements(
        { ...context, syncing: true },
        [ruleDecision({ alwaysRequireApproval: true })],
        approvalDeps(),
      ),
    ).toEqual({ required: false })
  })

  it('propagates a failed user read', async () => {
    const deps = createContentRouterDeps({
      db: { getUser: vi.fn().mockRejectedValue(new Error('db')) },
    })

    await expect(checkApprovalRequirements(context, [], deps)).rejects.toThrow(
      'db',
    )
  })
})

describe('checkExistingApprovalRequest', () => {
  const request = (overrides: Partial<ApprovalRequest>): ApprovalRequest => ({
    id: 1,
    userId: 1,
    userName: 'User 1',
    contentType: 'movie',
    contentTitle: 'Test Movie',
    contentKey: 'key',
    contentGuids: ['tmdb:1'],
    thumb: null,
    proposedRouterDecision: {
      action: 'require_approval',
      approval: {
        reason: 'r',
        triggeredBy: 'manual_flag',
        data: {},
        proposedRouting: {
          instanceId: 4,
          instanceType: 'radarr',
          priority: 50,
        },
      },
    },
    triggeredBy: 'manual_flag',
    status: 'pending',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  })

  const existingDeps = (existing: ApprovalRequest | null) => {
    const routeItemToRadarr = vi.fn(echoAppliedRadarr())
    const getApprovalRequestByContent = vi.fn().mockResolvedValue(existing)
    return {
      routeItemToRadarr,
      getApprovalRequestByContent,
      deps: createContentRouterDeps({
        db: { getApprovalRequestByContent },
        radarrManager: { routeItemToRadarr },
      }),
    }
  }

  it('continues when no request exists, keyed by the item key', async () => {
    const { deps, getApprovalRequestByContent } = existingDeps(null)

    expect(await checkExistingApprovalRequest(item, context, deps)).toBeNull()
    expect(getApprovalRequestByContent).toHaveBeenCalledWith(1, 'key')
  })

  it.each(['pending', 'rejected'] as const)(
    'stops without routing on a %s request',
    async (status) => {
      const { deps, routeItemToRadarr } = existingDeps(request({ status }))

      expect(await checkExistingApprovalRequest(item, context, deps)).toEqual({
        routedInstances: [],
        routingDetails: [],
      })
      expect(routeItemToRadarr).not.toHaveBeenCalled()
    },
  )

  it('continues on an expired request', async () => {
    const { deps } = existingDeps(request({ status: 'expired' }))

    expect(await checkExistingApprovalRequest(item, context, deps)).toBeNull()
  })

  it('replays an approved request', async () => {
    const { deps, routeItemToRadarr } = existingDeps(
      request({ status: 'approved' }),
    )

    const result = await checkExistingApprovalRequest(item, context, deps)

    expect(result?.routedInstances).toEqual([4])
    expect(routeItemToRadarr).toHaveBeenCalledTimes(1)
  })
})

describe('approvalRoutingFor', () => {
  const decision: RoutingDecision = {
    instanceId: 3,
    qualityProfile: '5',
    rootFolder: '/tv',
    tags: ['a'],
    priority: 60,
    seasonMonitoring: 'all',
    seriesType: 'anime',
  }

  it('is empty without a primary decision', () => {
    expect(approvalRoutingFor([], 'show', [2])).toEqual({})
  })

  it('maps the primary decision and drops an empty synced list', () => {
    expect(
      approvalRoutingFor([{ ...decision, ruleId: 6 }], 'show', []),
    ).toEqual({
      proposedRouting: {
        instanceId: 3,
        instanceType: 'sonarr',
        qualityProfile: '5',
        rootFolder: '/tv',
        tags: ['a'],
        priority: 60,
        searchOnAdd: undefined,
        seasonMonitoring: 'all',
        seriesType: 'anime',
        minimumAvailability: undefined,
        monitor: undefined,
        ruleId: 6,
        syncedInstances: undefined,
      },
    })
  })

  it('carries the synced tail and never treats it as additional routing', () => {
    const result = approvalRoutingFor(
      [decision, { ...decision, instanceId: 4 }],
      'show',
      [4],
    )
    expect(result.proposedRouting?.syncedInstances).toEqual([4])
    expect(result.additionalRouting).toBeUndefined()
  })

  it('stores the rule tail as additional routing, first decision per instance', () => {
    const result = approvalRoutingFor(
      [
        decision,
        {
          ...decision,
          instanceId: 4,
          rootFolder: '/four',
          priority: 40,
          ruleId: 8,
        },
        { ...decision, instanceId: 3, rootFolder: '/dup', priority: 30 },
        { ...decision, instanceId: 4, rootFolder: '/four-dup', priority: 20 },
      ],
      'show',
      undefined,
    )
    expect(result.proposedRouting?.syncedInstances).toBeUndefined()
    expect(result.additionalRouting).toEqual([
      expect.objectContaining({
        instanceId: 4,
        rootFolder: '/four',
        ruleId: 8,
      }),
    ])
  })

  it('stores no additional routing for a single rule decision', () => {
    expect(
      approvalRoutingFor([decision], 'show', undefined).additionalRouting,
    ).toBeUndefined()
  })
})
