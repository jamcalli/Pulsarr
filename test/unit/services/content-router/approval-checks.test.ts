import type { ApprovalRequest } from '@root/types/approval.types.js'
import type {
  ContentItem,
  RouterRule,
  RoutingContext,
  RoutingDecision,
} from '@root/types/router.types.js'
import {
  checkApprovalRequirements,
  checkExistingApprovalRequest,
  proposedRoutingFor,
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

const rule = (overrides: Partial<RouterRule>): RouterRule => ({
  id: 1,
  name: 'Drama',
  type: 'conditional',
  criteria: {
    condition: { field: 'genres', operator: 'contains', value: 'Drama' },
  },
  target_type: 'radarr',
  target_instance_id: 1,
  order: 50,
  enabled: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

const approvalDeps = (rules: RouterRule[], user: object | null = {}) =>
  createContentRouterDeps({
    db: {
      getUser: vi
        .fn()
        .mockResolvedValue(
          user && { id: 1, name: 'User 1', requires_approval: false, ...user },
        ),
    },
    rules: { get: vi.fn().mockResolvedValue(rules) },
  })

describe('checkApprovalRequirements', () => {
  it('requires approval when the first matching rule demands it', async () => {
    const deps = approvalDeps([
      rule({
        id: 7,
        always_require_approval: true,
        bypass_user_quotas: true,
        approval_reason: 'Drama needs review',
      }),
    ])

    expect(await checkApprovalRequirements(item, context, deps)).toEqual({
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

  it('stops at the first matching rule that does not require approval', async () => {
    const deps = approvalDeps([
      rule({ id: 1 }),
      rule({ id: 2, always_require_approval: true }),
    ])

    expect(await checkApprovalRequirements(item, context, deps)).toEqual({
      required: false,
      data: { quotasBypassedByRule: false },
    })
  })

  it('skips disabled, exclude and targetless rules', async () => {
    const deps = approvalDeps([
      rule({ enabled: false, always_require_approval: true }),
      rule({ exclude_from_routing: true, always_require_approval: true }),
      rule({ target_instance_id: null, always_require_approval: true }),
      rule({ target_type: 'sonarr', always_require_approval: true }),
    ])

    expect(await checkApprovalRequirements(item, context, deps)).toEqual({
      required: false,
      data: { quotasBypassedByRule: false },
    })
  })

  it('falls back to the user approval flag', async () => {
    const deps = approvalDeps([], { requires_approval: true })

    expect(await checkApprovalRequirements(item, context, deps)).toMatchObject({
      required: true,
      trigger: 'manual_flag',
    })
  })

  it('never requires approval while syncing', async () => {
    const deps = approvalDeps([rule({ always_require_approval: true })])

    expect(
      await checkApprovalRequirements(
        item,
        { ...context, syncing: true },
        deps,
      ),
    ).toEqual({ required: false })
  })

  it('propagates a failed rules read', async () => {
    const deps = createContentRouterDeps({
      db: { getUser: vi.fn().mockResolvedValue({ id: 1, name: 'User 1' }) },
      rules: { get: vi.fn().mockRejectedValue(new Error('db')) },
    })

    await expect(
      checkApprovalRequirements(item, context, deps),
    ).rejects.toThrow('db')
  })

  it('propagates a failed user read', async () => {
    const deps = createContentRouterDeps({
      db: { getUser: vi.fn().mockRejectedValue(new Error('db')) },
      rules: { get: vi.fn().mockResolvedValue([]) },
    })

    await expect(
      checkApprovalRequirements(item, context, deps),
    ).rejects.toThrow('db')
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

describe('proposedRoutingFor', () => {
  const decision: RoutingDecision = {
    instanceId: 3,
    qualityProfile: '5',
    rootFolder: '/tv',
    tags: ['a'],
    priority: 60,
    seasonMonitoring: 'all',
    seriesType: 'anime',
  }

  it('is undefined without a primary decision', () => {
    expect(proposedRoutingFor(undefined, 'show', [2])).toBeUndefined()
  })

  it('maps the primary decision and drops an empty synced list', () => {
    expect(proposedRoutingFor(decision, 'show', [])).toEqual({
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
      syncedInstances: undefined,
    })
  })

  it('carries the synced tail', () => {
    expect(
      proposedRoutingFor(decision, 'show', [4, 5])?.syncedInstances,
    ).toEqual([4, 5])
  })
})
