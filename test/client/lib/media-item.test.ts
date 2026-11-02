import { type RecentRequest, requestStatusTime } from '@/lib/media-item'

const createdAt = '2026-10-04T12:00:00.000Z'
const statusTimes = {
  requested: '2026-10-04T12:05:00.000Z',
  grabbed: '2026-10-04T13:00:00.000Z',
  notified: '2026-10-04T14:00:00.000Z',
}

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
    createdAt,
    statusTimes,
    primaryInstance: null,
    allInstances: [],
    ...overrides,
  }
}

describe('requestStatusTime', () => {
  it.each([
    ['requested', statusTimes.requested],
    ['grabbed', statusTimes.grabbed],
    ['notified', statusTimes.notified],
    ['pending', createdAt],
    ['pending_approval', createdAt],
  ] as const)('shows %s at %s', (status, expected) => {
    expect(requestStatusTime(request({ status }))).toBe(expected)
  })

  it('falls back to the creation time when the shown status has no record', () => {
    expect(
      requestStatusTime(
        request({
          status: 'grabbed',
          statusTimes: { ...statusTimes, grabbed: null },
        }),
      ),
    ).toBe(createdAt)
  })
})
