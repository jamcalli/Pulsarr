import type { ApprovalRequest } from '@root/types/approval.types.js'
import type { ContentItem, RoutingContext } from '@root/types/router.types.js'
import { routeUsingApprovedDecision } from '@services/content-router/approved-routing.js'
import { describe, expect, it, vi } from 'vitest'
import { echoAppliedSonarr } from '../../../mocks/applied-routing.js'
import { createContentRouterDeps } from '../../../mocks/content-router-deps.js'

const show: ContentItem = {
  title: 'Test Show',
  type: 'show',
  guids: ['tvdb:1'],
}

const context: RoutingContext = {
  userId: 1,
  contentType: 'show',
  itemKey: 'key',
}

const approved = (
  proposedRouting: NonNullable<
    ApprovalRequest['proposedRouterDecision']['approval']
  >['proposedRouting'],
): ApprovalRequest => ({
  id: 1,
  userId: 9,
  userName: 'User 9',
  contentType: 'show',
  contentTitle: 'Test Show',
  contentKey: 'key',
  contentGuids: ['tvdb:1'],
  thumb: null,
  proposedRouterDecision: {
    action: 'require_approval',
    approval: {
      reason: 'r',
      triggeredBy: 'router_rule',
      data: {},
      proposedRouting,
    },
  },
  routerRuleId: 12,
  triggeredBy: 'router_rule',
  status: 'approved',
  createdAt: '',
  updatedAt: '',
})

describe('routeUsingApprovedDecision', () => {
  it('routes the primary and synced instances with the approved settings', async () => {
    const routeItemToSonarr = vi.fn(echoAppliedSonarr())
    const deps = createContentRouterDeps({
      sonarrManager: { routeItemToSonarr },
    })

    const result = await routeUsingApprovedDecision(
      approved({
        instanceId: 2,
        instanceType: 'sonarr',
        priority: 50,
        rootFolder: '',
        qualityProfile: 4,
        seasonMonitoring: 'pilot',
        seriesType: 'daily',
        syncedInstances: [3],
      }),
      show,
      context,
      deps,
    )

    expect(result.routedInstances).toEqual([2, 3])
    expect(result.routingDetails).toEqual([
      expect.objectContaining({
        instanceId: 2,
        instanceType: 'sonarr',
        ruleId: 12,
      }),
    ])
    expect(routeItemToSonarr).toHaveBeenNthCalledWith(
      1,
      show,
      'key',
      9,
      2,
      false,
      {
        rootFolder: '',
        qualityProfile: 4,
        tags: [],
        searchOnAdd: undefined,
        minimumAvailability: undefined,
        monitor: undefined,
        seasonMonitoring: 'pilot',
        seriesType: 'daily',
      },
    )
    expect(routeItemToSonarr).toHaveBeenNthCalledWith(
      2,
      show,
      'key',
      9,
      3,
      true,
      {},
    )
  })

  it('counts an already added instance as routed and skips a failed one', async () => {
    const routeItemToSonarr = vi
      .fn()
      .mockRejectedValueOnce(new Error('This series has already been added'))
      .mockRejectedValueOnce(new Error('down'))
    const deps = createContentRouterDeps({
      sonarrManager: { routeItemToSonarr },
    })

    const result = await routeUsingApprovedDecision(
      approved({
        instanceId: 2,
        instanceType: 'sonarr',
        priority: 50,
        syncedInstances: [3],
      }),
      show,
      context,
      deps,
    )

    expect(result.routedInstances).toEqual([2])
  })

  it('routes nothing when the approved request has no instance', async () => {
    const routeItemToSonarr = vi.fn()
    const deps = createContentRouterDeps({
      sonarrManager: { routeItemToSonarr },
    })

    const result = await routeUsingApprovedDecision(
      approved(undefined),
      show,
      context,
      deps,
    )

    expect(result).toEqual({ routedInstances: [], routingDetails: [] })
    expect(routeItemToSonarr).not.toHaveBeenCalled()
  })
})
