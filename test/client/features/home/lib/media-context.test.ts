import type { PendingApproval } from '@/features/home/hooks/usePendingApprovals'
import type { RecentRequest } from '@/features/home/hooks/useRecentRequests'
import { mediaContext } from '@/features/home/lib/media-context'
import { setFormatLocale } from '@/lib/format'

const now = new Date(2026, 9, 4, 14, 0, 0).getTime()
const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString()
const inTwoDays = new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString()

function request(overrides: Partial<RecentRequest> = {}): RecentRequest {
  return {
    id: 7,
    source: 'watchlist',
    title: 'Severance',
    contentType: 'show',
    guids: ['tvdb:371980'],
    thumb: null,
    status: 'requested',
    userId: 1,
    userName: 'jamie',
    createdAt: twoHoursAgo,
    primaryInstance: null,
    allInstances: [instance()],
    ...overrides,
  }
}

function instance(
  overrides: Partial<RecentRequest['allInstances'][number]> = {},
): RecentRequest['allInstances'][number] {
  return {
    id: 1,
    name: 'Sonarr',
    instanceType: 'sonarr',
    status: 'requested',
    junctionStatus: 'requested',
    ...overrides,
  }
}

function approval(overrides: Partial<PendingApproval> = {}): PendingApproval {
  return {
    id: 42,
    userId: 1,
    userName: 'jamie',
    contentType: 'show',
    contentTitle: 'Severance',
    contentKey: 'abc',
    contentGuids: ['tvdb:371980'],
    thumb: null,
    proposedRouterDecision: { action: 'require_approval' },
    routerRuleId: null,
    triggeredBy: 'quota_exceeded',
    approvalReason: 'Over the weekly quota',
    status: 'pending',
    approvedBy: null,
    approvalNotes: null,
    expiresAt: null,
    createdAt: twoHoursAgo,
    updatedAt: twoHoursAgo,
    ...overrides,
  }
}

const displayName = (username: string) => username

describe('mediaContext', () => {
  beforeEach(() => setFormatLocale('en-US'))
  afterEach(() => setFormatLocale(undefined))

  it('waits on approval with the expiry', () => {
    const context = mediaContext({
      displayName,
      request: request({
        status: 'pending_approval',
        source: 'approval',
        id: 42,
        allInstances: [],
      }),
      approval: approval({
        expiresAt: inTwoDays,
        timeUntilExpiration: 2 * 24 * 60 * 60 * 1000,
      }),
      now,
    })

    expect(context.journey).toEqual([
      { label: 'Requested', detail: 'by jamie, 2 hours ago', state: 'done' },
      {
        label: 'Awaiting approval',
        detail: 'Expires in 2 days',
        state: 'waiting',
      },
      { label: 'Downloaded', detail: 'After approval', state: 'todo' },
      { label: 'Available', detail: 'Once it is downloaded', state: 'todo' },
    ])
  })

  it('waits on an admin when expiration is disabled', () => {
    const context = mediaContext({
      displayName,
      request: request({
        status: 'pending_approval',
        source: 'approval',
        id: 9,
      }),
      approval: approval(),
      now,
    })

    expect(context.journey?.[1]).toEqual({
      label: 'Awaiting approval',
      detail: 'Waiting for an admin decision',
      state: 'waiting',
    })
  })

  it('names every instance a requested title was sent to', () => {
    const context = mediaContext({
      displayName,
      request: request({
        title: 'Dune',
        contentType: 'movie',
        allInstances: [
          instance({ name: 'Radarr', instanceType: 'radarr' }),
          instance({
            id: 2,
            name: 'Radarr 4K',
            instanceType: 'radarr',
            status: 'pending',
            junctionStatus: 'pending',
          }),
        ],
      }),
      now,
    })

    expect(context.journey?.[1]).toEqual({
      label: 'Sent to Radarr + Radarr 4K',
      detail: null,
      state: 'done',
    })
    expect(context.journey?.slice(2)).toEqual([
      {
        label: 'Downloaded',
        detail: 'Sent to the instance, waiting on a release',
        state: 'progress',
      },
      { label: 'Available', detail: 'Once it is downloaded', state: 'todo' },
    ])
    expect(context.instances.map((instance) => instance.name)).toEqual([
      'Radarr',
      'Radarr 4K',
    ])
  })

  it('shows the file at the arr while Plex has not picked it up', () => {
    const grabbed = instance({ status: 'available', junctionStatus: 'grabbed' })
    const context = mediaContext({
      displayName,
      request: request({
        status: 'available',
        primaryInstance: grabbed,
        allInstances: [grabbed],
      }),
      now,
    })

    expect(context.journey?.slice(2)).toEqual([
      { label: 'Downloaded', detail: 'Sonarr has the file', state: 'done' },
      {
        label: 'Available',
        detail: 'Waiting for Plex to pick it up',
        state: 'progress',
      },
    ])
  })

  it('marks a notified title done', () => {
    const notified = instance({
      status: 'available',
      junctionStatus: 'notified',
    })
    const context = mediaContext({
      displayName,
      request: request({
        status: 'available',
        primaryInstance: notified,
        allInstances: [notified],
      }),
      now,
    })

    expect(context.journey?.map((step) => step.state)).toEqual([
      'done',
      'done',
      'done',
      'done',
    ])
    expect(context.journey?.[3]?.detail).toBe('In Plex, and the user was told')
  })

  it('follows the furthest instance when there is no primary', () => {
    const context = mediaContext({
      displayName,
      request: request({
        title: 'Dune',
        contentType: 'movie',
        status: 'available',
        primaryInstance: null,
        allInstances: [
          instance({ name: 'Radarr', instanceType: 'radarr' }),
          instance({
            id: 2,
            name: 'Radarr 4K',
            instanceType: 'radarr',
            status: 'available',
            junctionStatus: 'grabbed',
          }),
        ],
      }),
      now,
    })

    expect(context.journey?.[2]).toEqual({
      label: 'Downloaded',
      detail: 'Radarr 4K has the file',
      state: 'done',
    })
    expect(context.journey?.[3]?.state).toBe('progress')
  })

  it('names the requester by their display name', () => {
    const context = mediaContext({
      displayName: (username) =>
        username === 'jamie' ? 'Jamie Lee' : username,
      request: request(),
      now,
    })

    expect(context.journey?.[0]?.detail).toBe('by Jamie Lee, 2 hours ago')
  })

  it('keeps watchers from the rankings', () => {
    const context = mediaContext({
      displayName,
      watchers: ['jamie', 'sam', 'alex'],
      now,
    })

    expect(context.watchers).toEqual(['jamie', 'sam', 'alex'])
    expect(context.journey).toBeNull()
  })

  it('returns an empty context when there is no request', () => {
    expect(mediaContext({ displayName, now })).toEqual({
      journey: null,
      instances: [],
      watchers: [],
    })
  })
})
