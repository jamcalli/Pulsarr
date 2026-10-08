import type { ApprovalRequest } from '@root/types/approval.types.js'
import type { ContentItem, RoutingContext } from '@root/types/router.types.js'
import {
  approvedDestinations,
  routeUsingApprovedDecision,
} from '@services/content-router/approved-routing.js'
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

type StoredApproval = NonNullable<
  ApprovalRequest['proposedRouterDecision']['approval']
>

const approved = (
  proposedRouting: StoredApproval['proposedRouting'],
  additionalRouting?: StoredApproval['additionalRouting'],
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
      additionalRouting,
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

  it('replays only the requested instances of the record', async () => {
    const routeItemToSonarr = vi.fn(echoAppliedSonarr())
    const deps = createContentRouterDeps({
      sonarrManager: { routeItemToSonarr },
    })

    const result = await routeUsingApprovedDecision(
      approved(
        {
          instanceId: 2,
          instanceType: 'sonarr',
          priority: 50,
          syncedInstances: [3],
        },
        [
          {
            instanceId: 4,
            instanceType: 'sonarr',
            priority: 40,
            rootFolder: '/stored-4',
          },
        ],
      ),
      show,
      context,
      deps,
      [3, 4],
    )

    expect(result.routedInstances).toEqual([3, 4])
    expect(result.routingDetails).toEqual([
      expect.objectContaining({ instanceId: 4, rootFolder: '/stored-4' }),
    ])
    expect(routeItemToSonarr.mock.calls.map((call) => call[3])).toEqual([3, 4])
  })

  it('names the primary rule from the stored routing over the approval rule', async () => {
    const deps = createContentRouterDeps({
      sonarrManager: { routeItemToSonarr: vi.fn(echoAppliedSonarr()) },
    })

    const result = await routeUsingApprovedDecision(
      approved({
        instanceId: 2,
        instanceType: 'sonarr',
        priority: 50,
        ruleId: 30,
      }),
      show,
      context,
      deps,
    )

    expect(result.routingDetails[0].ruleId).toBe(30)
  })

  it('falls back to the approval rule when legacy stored routing has no rule', async () => {
    const deps = createContentRouterDeps({
      sonarrManager: { routeItemToSonarr: vi.fn(echoAppliedSonarr()) },
    })

    const result = await routeUsingApprovedDecision(
      approved({ instanceId: 2, instanceType: 'sonarr', priority: 50 }),
      show,
      context,
      deps,
    )

    expect(result.routingDetails[0].ruleId).toBe(12)
  })

  it('routes each additional rule target with its own settings after the synced tail', async () => {
    const routeItemToSonarr = vi.fn(echoAppliedSonarr())
    const deps = createContentRouterDeps({
      sonarrManager: { routeItemToSonarr },
    })

    const result = await routeUsingApprovedDecision(
      approved({ instanceId: 2, instanceType: 'sonarr', priority: 60 }, [
        {
          instanceId: 5,
          instanceType: 'sonarr',
          priority: 40,
          rootFolder: '/five',
          seriesType: 'anime',
          ruleId: 13,
        },
      ]),
      show,
      context,
      deps,
    )

    expect(result.routedInstances).toEqual([2, 5])
    expect(result.routingDetails).toEqual([
      expect.objectContaining({ instanceId: 2, ruleId: 12 }),
      expect.objectContaining({
        instanceId: 5,
        rootFolder: '/five',
        ruleId: 13,
      }),
    ])
    expect(routeItemToSonarr).toHaveBeenNthCalledWith(
      2,
      show,
      'key',
      9,
      5,
      false,
      expect.objectContaining({ rootFolder: '/five', seriesType: 'anime' }),
    )
  })

  it('skips a failed additional target and keeps the primary', async () => {
    const routeItemToSonarr = vi
      .fn()
      .mockImplementationOnce(echoAppliedSonarr())
      .mockRejectedValueOnce(new Error('down'))
    const deps = createContentRouterDeps({
      sonarrManager: { routeItemToSonarr },
    })

    const result = await routeUsingApprovedDecision(
      approved({ instanceId: 2, instanceType: 'sonarr', priority: 60 }, [
        { instanceId: 5, instanceType: 'sonarr', priority: 40 },
      ]),
      show,
      context,
      deps,
    )

    expect(result.routedInstances).toEqual([2])
    expect(result.routingDetails).toHaveLength(1)
  })

  it('reports no details for a failed primary and keeps the additional target', async () => {
    const routeItemToSonarr = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockImplementationOnce(echoAppliedSonarr())
    const deps = createContentRouterDeps({
      sonarrManager: { routeItemToSonarr },
    })

    const result = await routeUsingApprovedDecision(
      approved({ instanceId: 2, instanceType: 'sonarr', priority: 60 }, [
        { instanceId: 5, instanceType: 'sonarr', priority: 40 },
      ]),
      show,
      context,
      deps,
    )

    expect(result.routedInstances).toEqual([5])
    expect(result.routingDetails.map((d) => d.instanceId)).toEqual([5])
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

describe('approvedDestinations', () => {
  it('lists the primary, synced and additional instances', () => {
    const request = approved(
      {
        instanceId: 2,
        instanceType: 'sonarr',
        priority: 50,
        syncedInstances: [3],
      },
      [{ instanceId: 4, instanceType: 'sonarr', priority: 40 }],
    )

    expect(approvedDestinations(request)).toEqual([2, 3, 4])
  })

  it('lists nothing when the record has no primary routing', () => {
    const request = approved({
      instanceId: 0,
      instanceType: 'sonarr',
      priority: 50,
    })

    expect(approvedDestinations(request)).toEqual([])
  })
})
