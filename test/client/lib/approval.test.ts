import { ARR_API_KEY_PLACEHOLDER } from '@root/schemas/common/arr-placeholder'
import {
  type ArrTarget,
  approveBlockedReason,
  canApprove,
  decisionSummary,
  defaultRouting,
  expiryLine,
  guidsLine,
  instanceOptions,
  proposedRouting,
  requestedLine,
  routingFacts,
  routingHeading,
  triggerSummary,
  withRouting,
} from '@/lib/approval'
import { formatDate, formatTime, setFormatLocale } from '@/lib/format'
import type { components } from '@/types/api.js'

type ApprovalRequest = components['schemas']['ApprovalRequest']
type RouterDecision = ApprovalRequest['proposedRouterDecision']
type ApprovalQuotaData = components['schemas']['ApprovalQuotaData']
type ApprovalRouting = components['schemas']['ApprovalRouting']

const routing = {
  instanceId: 1,
  instanceType: 'sonarr',
  priority: 50,
} as const satisfies RouterDecision['routing']

const otherRouting = { ...routing, instanceId: 2 }

function decisionWithData(
  data: ApprovalQuotaData,
  triggeredBy: ApprovalRequest['triggeredBy'] = 'quota_exceeded',
): RouterDecision {
  return {
    action: 'require_approval',
    approval: { reason: 'stored', triggeredBy, data, proposedRouting: routing },
  }
}

function makeRequest(
  overrides: Partial<ApprovalRequest> = {},
): ApprovalRequest {
  return {
    id: 1,
    userId: 2,
    userName: 'sarah',
    contentType: 'show',
    contentTitle: 'Severance',
    contentKey: 'key',
    contentGuids: [],
    thumb: null,
    proposedRouterDecision: decisionWithData({}),
    routerRuleId: null,
    triggeredBy: 'quota_exceeded',
    approvalReason: 'weekly_rolling quota exceeded (6/5)',
    status: 'pending',
    approvedBy: null,
    approvalNotes: null,
    expiresAt: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-02T12:30:00.000Z',
    ...overrides,
  }
}

describe('guidsLine', () => {
  it('joins the stored ids with their source', () => {
    expect(guidsLine(['imdb:tt4301160', 'tmdb:155537'])).toBe(
      'imdb tt4301160, tmdb 155537',
    )
  })

  it('is null when there are no ids', () => {
    expect(guidsLine([])).toBeNull()
  })
})

describe('proposedRouting', () => {
  it('reads routing for a route action', () => {
    expect(proposedRouting({ action: 'route', routing })).toEqual(routing)
  })

  it('reads the approval branch for require_approval', () => {
    expect(proposedRouting(decisionWithData({}))).toEqual(routing)
  })

  it('returns null when the branch has no routing', () => {
    expect(proposedRouting({ action: 'route' })).toBeNull()
    expect(proposedRouting({ action: 'require_approval' })).toBeNull()
  })

  it('ignores routing on actions the server never routes', () => {
    expect(
      proposedRouting({
        action: 'continue',
        routing,
        approval: decisionWithData({}).approval,
      }),
    ).toBeNull()
  })
})

describe('withRouting', () => {
  it('writes the route branch and round-trips', () => {
    const request = makeRequest({
      proposedRouterDecision: { action: 'route', routing },
    })
    const next = withRouting(request, otherRouting)
    expect(next).toEqual({ action: 'route', routing: otherRouting })
    expect(proposedRouting(next)).toEqual(otherRouting)
    expect(request.proposedRouterDecision.routing).toEqual(routing)
  })

  it('writes the approval branch and keeps its reason and data', () => {
    const request = makeRequest({
      proposedRouterDecision: decisionWithData({ quotaUsage: 6 }),
    })
    const next = withRouting(request, otherRouting)
    expect(next.approval).toEqual({
      reason: 'stored',
      triggeredBy: 'quota_exceeded',
      data: { quotaUsage: 6 },
      proposedRouting: otherRouting,
    })
    expect(proposedRouting(next)).toEqual(otherRouting)
    expect(request.proposedRouterDecision.approval?.proposedRouting).toEqual(
      routing,
    )
  })

  it('creates the approval branch from the request when absent', () => {
    const request = makeRequest({
      triggeredBy: 'router_rule',
      approvalReason: 'Needs a look',
      proposedRouterDecision: { action: 'continue' },
    })
    const next = withRouting(request, routing)
    expect(next).toEqual({
      action: 'require_approval',
      approval: {
        reason: 'Needs a look',
        triggeredBy: 'router_rule',
        data: {},
        proposedRouting: routing,
      },
    })
    expect(proposedRouting(next)).toEqual(routing)
  })
})

describe('triggerSummary', () => {
  beforeEach(() => setFormatLocale('en-US'))
  afterEach(() => setFormatLocale(undefined))

  it.each([
    ['daily', 'Daily', 'today'],
    ['weekly_rolling', 'Weekly', 'in the last 7 days'],
    ['monthly', 'Monthly', 'this month'],
  ] as const)(
    'names the %s quota without counting this request',
    (quotaType, period, window) => {
      const request = makeRequest({
        proposedRouterDecision: decisionWithData({
          quotaType,
          quotaUsage: 6,
          quotaLimit: 5,
        }),
      })
      expect(triggerSummary(request, 'sarah')).toEqual({
        kind: 'Quota exceeded',
        line: `${period} quota: 5 of 5 shows used`,
        reason: `sarah has requested 5 shows ${window}.`,
      })
    },
  )

  it('uses singular nouns for a limit and usage of one', () => {
    const request = makeRequest({
      contentType: 'movie',
      proposedRouterDecision: decisionWithData({
        quotaType: 'monthly',
        quotaUsage: 2,
        quotaLimit: 1,
      }),
    })
    expect(triggerSummary(request, 'dad')).toEqual({
      kind: 'Quota exceeded',
      line: 'Monthly quota: 1 of 1 movie used',
      reason: 'dad has requested 1 movie this month.',
    })
  })

  it('falls back to the stored reason when quota data is missing', () => {
    const request = makeRequest({
      proposedRouterDecision: decisionWithData({ quotaType: 'daily' }),
    })
    expect(triggerSummary(request, 'sarah')).toEqual({
      kind: 'Quota exceeded',
      line: 'weekly_rolling quota exceeded (6/5)',
      reason: null,
    })
  })

  it('hides the default router rule reason', () => {
    const request = makeRequest({
      triggeredBy: 'router_rule',
      approvalReason: 'Approval required by router rule: Kids',
      proposedRouterDecision: decisionWithData(
        { criteriaType: 'router_rule', criteriaValue: 'Kids' },
        'router_rule',
      ),
    })
    expect(triggerSummary(request, 'sarah')).toEqual({
      kind: 'Router rule',
      line: 'Rule: Kids',
      reason: null,
    })
  })

  it('keeps a custom router rule reason', () => {
    const request = makeRequest({
      triggeredBy: 'router_rule',
      approvalReason: 'R rated content',
      proposedRouterDecision: decisionWithData(
        { criteriaType: 'router_rule', criteriaValue: 'Kids' },
        'router_rule',
      ),
    })
    expect(triggerSummary(request, 'sarah').reason).toBe('R rated content')
  })

  it('falls back when the router rule name is missing', () => {
    const request = makeRequest({
      triggeredBy: 'router_rule',
      approvalReason: 'Custom',
      proposedRouterDecision: decisionWithData({}, 'router_rule'),
    })
    expect(triggerSummary(request, 'sarah')).toEqual({
      kind: 'Router rule',
      line: 'Custom',
      reason: null,
    })
  })

  it('names users who need approval for every request', () => {
    const request = makeRequest({
      triggeredBy: 'manual_flag',
      approvalReason: 'User "kids" requires approval for all content',
      proposedRouterDecision: decisionWithData(
        { criteriaType: 'user_requires_approval', criteriaValue: 'kids' },
        'manual_flag',
      ),
    })
    expect(triggerSummary(request, 'kids')).toEqual({
      kind: 'Manual flag',
      line: 'Every request from kids needs approval',
      reason: null,
    })
  })

  it('shows the stored reason for other manual flags', () => {
    const request = makeRequest({
      triggeredBy: 'manual_flag',
      approvalReason: 'Approval required',
      proposedRouterDecision: decisionWithData({}, 'manual_flag'),
    })
    expect(triggerSummary(request, 'sarah')).toEqual({
      kind: 'Manual flag',
      line: 'Approval required',
      reason: null,
    })
  })

  it('uses the stored reason or the kind for content criteria', () => {
    const base = {
      triggeredBy: 'content_criteria',
      proposedRouterDecision: decisionWithData({}, 'content_criteria'),
    } as const
    expect(
      triggerSummary(
        makeRequest({ ...base, approvalReason: 'Auto-added' }),
        'sarah',
      ),
    ).toEqual({ kind: 'Content criteria', line: 'Auto-added', reason: null })
    expect(
      triggerSummary(makeRequest({ ...base, approvalReason: null }), 'sarah')
        .line,
    ).toBe('Content criteria')
  })
})

describe('expiryLine', () => {
  const now = Date.parse('2026-10-05T12:00:00.000Z')
  beforeEach(() => setFormatLocale('en-US'))
  afterEach(() => setFormatLocale(undefined))

  it('returns null when expiration is disabled', () => {
    expect(
      expiryLine(
        makeRequest({
          expiresAt: '2026-10-07T12:00:00.000Z',
          timeUntilExpiration: null,
        }),
        now,
      ),
    ).toBeNull()
    expect(expiryLine(makeRequest(), now)).toBeNull()
  })

  it('formats the time left relative to now', () => {
    expect(
      expiryLine(
        makeRequest({
          expiresAt: '2026-10-07T12:00:00.000Z',
          timeUntilExpiration: 172_800_000,
          expirationStatus: 'active',
        }),
        now,
      ),
    ).toEqual({ text: 'Expires in 2 days', soon: false })
  })

  it('flags requests expiring soon', () => {
    expect(
      expiryLine(
        makeRequest({
          expiresAt: '2026-10-05T15:00:00.000Z',
          timeUntilExpiration: 10_800_000,
          expirationStatus: 'expiring_soon',
        }),
        now,
      ),
    ).toEqual({ text: 'Expires in 3 hours', soon: true })
  })
})

describe('defaultRouting', () => {
  const shared = {
    name: 'Main',
    baseUrl: 'http://arr.local',
    apiKey: 'key',
    qualityProfile: 4,
    rootFolder: '/media',
    bypassIgnored: false,
    searchOnAdd: true,
    tags: ['family'],
    isDefault: true,
    skipDefaultRoutingWhenNoMatch: false,
    id: 3,
  }

  it('seeds Radarr settings from the instance', () => {
    expect(
      defaultRouting({
        type: 'radarr',
        instance: {
          ...shared,
          minimumAvailability: 'released',
          monitor: 'movieOnly',
          syncedInstances: [4],
        },
      }),
    ).toEqual({
      instanceId: 3,
      instanceType: 'radarr',
      qualityProfile: 4,
      rootFolder: '/media',
      tags: ['family'],
      priority: 50,
      searchOnAdd: true,
      syncedInstances: [4],
      minimumAvailability: 'released',
      monitor: 'movieOnly',
    })
  })

  it('seeds Sonarr settings and drops empty synced instances', () => {
    expect(
      defaultRouting({
        type: 'sonarr',
        instance: {
          ...shared,
          qualityProfile: undefined,
          rootFolder: undefined,
          seasonMonitoring: 'all',
          monitorNewItems: 'all',
          createSeasonFolders: false,
          seriesType: 'anime',
          syncedInstances: [],
        },
      }),
    ).toEqual({
      instanceId: 3,
      instanceType: 'sonarr',
      qualityProfile: null,
      rootFolder: null,
      tags: ['family'],
      priority: 50,
      searchOnAdd: true,
      syncedInstances: undefined,
      seasonMonitoring: 'all',
      seriesType: 'anime',
    })
  })
})

describe('instanceOptions', () => {
  const radarr = (
    id: number,
    name: string,
    isDefault: boolean,
    apiKey = 'key',
  ): ArrTarget => ({
    type: 'radarr',
    instance: {
      id,
      name,
      isDefault,
      apiKey,
      baseUrl: 'http://arr.local',
      bypassIgnored: false,
      searchOnAdd: true,
      tags: [],
      minimumAvailability: 'released',
      monitor: 'movieOnly',
      skipDefaultRoutingWhenNoMatch: false,
    },
  })
  const targets = [
    radarr(1, 'Radarr', true),
    radarr(2, 'Radarr 4K', false, ARR_API_KEY_PLACEHOLDER),
  ]

  it('lists configured targets only when the stored one is usable', () => {
    expect(instanceOptions(targets, 1)).toEqual([
      { value: '1', label: 'Radarr (default)' },
    ])
  })

  it('keeps an unconfigured stored target as a disabled option', () => {
    expect(instanceOptions(targets, 2)).toEqual([
      { value: '1', label: 'Radarr (default)' },
      { value: '2', label: 'Radarr 4K (not connected)', disabled: true },
    ])
  })

  it('names a deleted stored target by its id', () => {
    expect(instanceOptions(targets, 9)).toContainEqual({
      value: '9',
      label: 'Instance 9 (not connected)',
      disabled: true,
    })
  })
})

describe('canApprove and approveBlockedReason', () => {
  it.each([
    ['review', routing, false, true, null],
    ['review', routing, true, false, null],
    ['review', null, false, false, 'Set routing to approve.'],
    [
      'edit',
      routing,
      false,
      false,
      'Save or cancel your routing changes to approve.',
    ],
    [
      'edit',
      null,
      false,
      false,
      'Save or cancel your routing changes to approve.',
    ],
    ['deny', routing, false, false, null],
  ] as const)(
    'stage %s with routing %o and busy %s',
    (stage, current, busy, allowed, reason) => {
      expect(canApprove({ stage, routing: current, busy })).toBe(allowed)
      expect(approveBlockedReason({ stage, routing: current })).toBe(reason)
    },
  )
})

describe('decisionSummary', () => {
  beforeEach(() => setFormatLocale('en-US'))
  afterEach(() => setFormatLocale(undefined))

  const decidedAt = new Date('2026-10-02T12:30:00.000Z')

  it('returns null while pending', () => {
    expect(decisionSummary(makeRequest())).toBeNull()
  })

  it.each([
    ['approved', 'Approved', 'Notes', 'Looks fine'],
    ['auto_approved', 'Auto approved', 'Notes', null],
    ['rejected', 'Denied', 'Reason', 'Not for kids'],
    ['expired', 'Expired', 'Notes', null],
  ] as const)('summarizes %s', (status, label, noteLabel, note) => {
    const at = `${formatDate(decidedAt)}, ${formatTime(decidedAt)}`
    expect(
      decisionSummary(
        makeRequest({ status, approvalNotes: note, approvedBy: 1 }),
      ),
    ).toEqual({ label, at, noteLabel, note })
  })
})

describe('requestedLine', () => {
  beforeEach(() => setFormatLocale('en-US'))
  afterEach(() => setFormatLocale(undefined))

  it('names the type, requester and age', () => {
    const now = new Date('2026-10-01T12:00:00.000Z').getTime()
    expect(requestedLine(makeRequest(), 'Sarah B', now)).toBe(
      'Show, requested by Sarah B, 2 hours ago',
    )
  })
})

describe('routingHeading', () => {
  it.each([
    ['pending', 'Where it will go'],
    ['approved', 'Where it went'],
    ['auto_approved', 'Where it went'],
    ['rejected', 'Where it would have gone'],
    ['expired', 'Where it would have gone'],
  ] as const)('uses the right tense for %s', (status, heading) => {
    expect(routingHeading(status)).toBe(heading)
  })
})

describe('routingFacts', () => {
  beforeEach(() => setFormatLocale('en-US'))
  afterEach(() => setFormatLocale(undefined))

  const sonarr: ApprovalRouting = {
    instanceId: 1,
    instanceType: 'sonarr',
    priority: 50,
    qualityProfile: 4,
    rootFolder: '/tv',
    tags: ['9', '10'],
    searchOnAdd: false,
    seasonMonitoring: 'firstSeason',
    seriesType: 'anime',
  }

  it('resolves labels for a Sonarr target', () => {
    expect(
      routingFacts({
        routing: sonarr,
        qualityProfiles: [{ value: '4', label: 'HD-1080p' }],
        tags: [
          { value: '9', label: 'kids' },
          { value: '10', label: 'anime' },
        ],
        syncedNames: ['Sonarr 4K'],
      }),
    ).toEqual([
      { label: 'Quality profile', value: 'HD-1080p' },
      { label: 'Tags', value: 'kids, anime' },
      { label: 'Root folder', value: '/tv' },
      { label: 'Search on add', value: 'Add without searching' },
      { label: 'Season monitoring', value: 'First season' },
      { label: 'Series type', value: 'Anime' },
      { label: 'Also send to', value: 'Sonarr 4K' },
    ])
  })

  it('falls back to raw values and a tag count before options load', () => {
    expect(
      routingFacts({
        routing: sonarr,
        qualityProfiles: [],
        tags: [],
        syncedNames: null,
      }).slice(0, 2),
    ).toEqual([
      { label: 'Quality profile', value: '4' },
      { label: 'Tags', value: '2 tags' },
    ])
  })

  it('shows Radarr settings and drops unset ones', () => {
    expect(
      routingFacts({
        routing: {
          instanceId: 2,
          instanceType: 'radarr',
          priority: 50,
          minimumAvailability: 'released',
        },
        qualityProfiles: [],
        tags: [],
        syncedNames: null,
      }),
    ).toEqual([
      { label: 'Quality profile', value: 'Not set' },
      { label: 'Tags', value: 'None' },
      { label: 'Root folder', value: 'Not set' },
      { label: 'Search on add', value: 'Search as soon as it is added' },
      { label: 'Minimum availability', value: 'Released' },
    ])
  })
})
