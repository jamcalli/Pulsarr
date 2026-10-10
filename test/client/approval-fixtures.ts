import { HttpResponse, http } from 'msw'
import type { components } from '@/types/api.js'
import { server } from './setup.js'

type ApprovalRequest = components['schemas']['ApprovalRequest']
type ApprovalRouting = components['schemas']['ApprovalRouting']

export const sonarrRouting: ApprovalRouting = {
  instanceId: 1,
  instanceType: 'sonarr',
  priority: 50,
  qualityProfile: 4,
  rootFolder: '/tv',
  tags: ['9'],
  searchOnAdd: true,
  seasonMonitoring: 'all',
  seriesType: 'standard',
  syncedInstances: [2],
}

export function makeApproval(
  overrides: Partial<ApprovalRequest> = {},
  routing: ApprovalRouting | null = sonarrRouting,
): ApprovalRequest {
  return {
    id: 7,
    userId: 2,
    userName: 'sarah',
    contentType: 'show',
    contentTitle: 'Severance',
    contentKey: 'key',
    contentGuids: [],
    thumb: '/severance.jpg',
    proposedRouterDecision: {
      action: 'require_approval',
      approval: {
        reason: 'stored',
        triggeredBy: 'quota_exceeded',
        data: { quotaType: 'weekly_rolling', quotaUsage: 6, quotaLimit: 5 },
        proposedRouting: routing ?? undefined,
      },
    },
    routerRuleId: null,
    triggeredBy: 'quota_exceeded',
    approvalReason: 'weekly_rolling quota exceeded (6/5)',
    status: 'pending',
    approvedBy: null,
    approvalNotes: null,
    expiresAt: null,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    updatedAt: '2026-10-02T12:30:00.000Z',
    ...overrides,
  }
}

export function sonarrInstance(
  id: number,
  name: string,
  isDefault: boolean,
  apiKey = 'real-key',
) {
  return {
    id,
    name,
    baseUrl: 'http://sonarr:8989',
    apiKey,
    bypassIgnored: false,
    qualityProfile: String(id * 4),
    rootFolder: id === 1 ? '/tv' : `/tv-${id}`,
    seasonMonitoring: 'all',
    searchOnAdd: true,
    seriesType: 'standard',
    tags: [],
    isDefault,
  }
}

const defaultSonarrInstances = [
  sonarrInstance(1, 'Sonarr', true),
  sonarrInstance(2, 'Sonarr 4K', false),
]

function instanceIdOf(request: Request): number {
  return Number(new URL(request.url).searchParams.get('instanceId'))
}

/** Serves the config the trigger copy reads, a 10 day rolling week and a monthly reset on the 15th. */
export function mockQuotaConfig() {
  server.use(
    http.get('/v1/config', () =>
      HttpResponse.json({
        success: true,
        config: {
          quotaSettings: {
            cleanup: { enabled: true, retentionDays: 90 },
            weeklyRolling: { resetDays: 10 },
            monthly: { resetDay: 15, handleMonthEnd: 'last-day' },
          },
        },
      }),
    ),
  )
}

/** Serves every request the review panel makes, with `approval` behind the by-id route. */
export function mockApprovalEndpoints(
  approval: ApprovalRequest,
  sonarrInstances = defaultSonarrInstances,
) {
  const meta = {
    success: true,
    instance: { id: 1, name: 'Sonarr', baseUrl: 'http://sonarr:8989' },
  }
  server.use(
    http.get('/v1/approval/requests/:id', () =>
      HttpResponse.json({
        success: true,
        message: 'ok',
        approvalRequest: approval,
      }),
    ),
    http.get('/v1/sonarr/instances', () => HttpResponse.json(sonarrInstances)),
    http.get('/v1/radarr/instances', () => HttpResponse.json([])),
    http.get('/v1/sonarr/quality-profiles', ({ request }) =>
      HttpResponse.json({
        ...meta,
        qualityProfiles:
          instanceIdOf(request) === 1
            ? [{ id: 4, name: 'HD-1080p' }]
            : [{ id: 8, name: 'Ultra-HD' }],
      }),
    ),
    http.get('/v1/sonarr/root-folders', ({ request }) => {
      const id = instanceIdOf(request)
      return HttpResponse.json({
        ...meta,
        rootFolders: [{ id: 1, path: id === 1 ? '/tv' : `/tv-${id}` }],
      })
    }),
    http.get('/v1/sonarr/tags', () =>
      HttpResponse.json({ ...meta, tags: [{ id: 9, label: 'sarah' }] }),
    ),
    http.get('/v1/users/list', () =>
      HttpResponse.json({ success: true, message: 'ok', users: [] }),
    ),
  )
}

/** Serves the create-tag route and adds the tag to later tag lists, returning the request bodies. */
export function mockCreateTag(
  type: 'radarr' | 'sonarr',
  tag: { id: number; label: string },
) {
  const bodies: unknown[] = []
  let createdTag = false
  server.use(
    http.post(`/v1/${type}/create-tag`, async ({ request }) => {
      bodies.push(await request.json())
      createdTag = true
      return HttpResponse.json(tag)
    }),
    http.get(`/v1/${type}/tags`, () =>
      HttpResponse.json({
        success: true,
        instance: { id: 1, name: 'Sonarr', baseUrl: 'http://sonarr:8989' },
        tags: createdTag
          ? [{ id: 9, label: 'sarah' }, tag]
          : [{ id: 9, label: 'sarah' }],
      }),
    ),
  )
  return bodies
}
