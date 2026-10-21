import { formatDateTime, setFormatLocale } from '@/lib/format'
import { mediaContext } from '@/lib/media-context'
import type { RecentRequest } from '@/lib/media-item'
import type { components } from '@/types/api.js'

type PendingApproval = components['schemas']['ApprovalRequest']

const now = new Date(2026, 9, 4, 14, 0, 0).getTime()
const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString()
const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString()
const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000).toISOString()
const inTwoDays = new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString()

function request(overrides: Partial<RecentRequest> = {}): RecentRequest {
  return {
    id: 7,
    source: 'watchlist',
    title: 'Severance',
    key: 'severance',
    contentType: 'show',
    guids: ['tvdb:371980'],
    thumb: null,
    status: 'requested',
    userId: 1,
    userName: 'jamie',
    createdAt: twoHoursAgo,
    statusTimes: { requested: null, grabbed: null, notified: null },
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
      {
        label: 'Requested',
        detail: 'by jamie',
        time: formatDateTime(new Date(twoHoursAgo)),
        state: 'done',
      },
      {
        label: 'Awaiting approval',
        detail: 'Expires in 2 days',
        time: null,
        state: 'waiting',
      },
      {
        label: 'Download',
        detail: 'After approval',
        time: null,
        state: 'todo',
      },
      {
        label: 'Notification',
        detail: 'Once it is downloaded',
        time: null,
        state: 'todo',
      },
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
      time: null,
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
            junctionStatus: 'pending',
          }),
        ],
      }),
      now,
    })

    expect(context.journey?.[1]).toEqual({
      label: 'Sent to Radarr + Radarr 4K',
      detail: null,
      time: null,
      state: 'done',
    })
    expect(context.journey?.slice(2)).toEqual([
      {
        label: 'Download',
        detail: 'Radarr has no file yet',
        time: null,
        state: 'progress',
      },
      {
        label: 'Notification',
        detail: 'Once it is downloaded',
        time: null,
        state: 'todo',
      },
    ])
    expect(context.instances.map((instance) => instance.name)).toEqual([
      'Radarr',
      'Radarr 4K',
    ])
  })

  it('shows the file at the arr before the user is told', () => {
    const grabbed = instance({ junctionStatus: 'grabbed' })
    const context = mediaContext({
      displayName,
      request: request({
        status: 'grabbed',
        primaryInstance: grabbed,
        allInstances: [grabbed],
      }),
      now,
    })

    expect(context.journey?.slice(2)).toEqual([
      {
        label: 'Download',
        detail: 'Sonarr has the file',
        time: null,
        state: 'done',
      },
      {
        label: 'Notification',
        detail: 'No notification yet',
        time: null,
        state: 'progress',
      },
    ])
  })

  it('marks a notified title done', () => {
    const notified = instance({ junctionStatus: 'notified' })
    const context = mediaContext({
      displayName,
      request: request({
        status: 'notified',
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
    expect(context.journey?.[3]?.detail).toBe('The user was told')
  })

  it('shows when each done step happened', () => {
    const notified = instance({ junctionStatus: 'notified' })
    const context = mediaContext({
      displayName,
      request: request({
        status: 'notified',
        primaryInstance: notified,
        allInstances: [notified],
        statusTimes: {
          requested: twoHoursAgo,
          grabbed: oneHourAgo,
          notified: thirtyMinutesAgo,
        },
      }),
      now,
    })

    expect(context.journey?.map((step) => step.time)).toEqual([
      formatDateTime(new Date(twoHoursAgo)),
      formatDateTime(new Date(twoHoursAgo)),
      formatDateTime(new Date(oneHourAgo)),
      formatDateTime(new Date(thirtyMinutesAgo)),
    ])
    expect(context.journey?.slice(1).map((step) => step.detail)).toEqual([
      null,
      'Sonarr has the file',
      'The user was told',
    ])
  })

  it('keeps the step text when there is no status record', () => {
    const notified = instance({ junctionStatus: 'notified' })
    const context = mediaContext({
      displayName,
      request: request({
        status: 'notified',
        primaryInstance: notified,
        allInstances: [notified],
      }),
      now,
    })

    expect(context.journey?.slice(1).map((step) => step.detail)).toEqual([
      null,
      'Sonarr has the file',
      'The user was told',
    ])
    expect(context.journey?.slice(1).map((step) => step.time)).toEqual([
      null,
      null,
      null,
    ])
  })

  it('never times a step still in progress', () => {
    const context = mediaContext({
      displayName,
      request: request({
        statusTimes: {
          requested: twoHoursAgo,
          grabbed: oneHourAgo,
          notified: null,
        },
      }),
      now,
    })

    expect(context.journey?.[2]).toEqual({
      label: 'Download',
      detail: 'Sonarr has no file yet',
      time: null,
      state: 'progress',
    })
  })

  it('follows the furthest instance when there is no primary', () => {
    const context = mediaContext({
      displayName,
      request: request({
        title: 'Dune',
        contentType: 'movie',
        status: 'grabbed',
        primaryInstance: null,
        allInstances: [
          instance({ name: 'Radarr', instanceType: 'radarr' }),
          instance({
            id: 2,
            name: 'Radarr 4K',
            instanceType: 'radarr',
            junctionStatus: 'grabbed',
          }),
        ],
      }),
      now,
    })

    expect(context.journey?.[2]).toEqual({
      label: 'Download',
      detail: 'Radarr 4K has the file',
      time: null,
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

    expect(context.journey?.[0]?.detail).toBe('by Jamie Lee')
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
