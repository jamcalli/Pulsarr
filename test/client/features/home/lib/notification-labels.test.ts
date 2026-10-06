import {
  channelRows,
  groupNotificationTypes,
} from '@/features/home/lib/notification-labels'

describe('channelRows', () => {
  it('keeps the table order and fills missing channels with zero', () => {
    const rows = channelRows([
      { channel: 'apprise', count: 4 },
      { channel: 'discord', count: 9 },
    ])

    expect(rows.map((row) => [row.channel, row.count])).toEqual([
      ['discord', 9],
      ['plex_mobile', 0],
      ['apprise', 4],
      ['native_webhook', 0],
    ])
  })

  it('appends an unknown channel under its raw key in the fallback color', () => {
    const rows = channelRows([{ channel: 'carrier_pigeon', count: 2 }])
    const unknown = rows.at(-1)

    expect(unknown).toMatchObject({
      channel: 'carrier_pigeon',
      label: 'carrier_pigeon',
      color: 'chart-1',
      count: 2,
    })
  })
})

describe('groupNotificationTypes', () => {
  it('groups types into families and drops types outside the table', () => {
    const { families } = groupNotificationTypes([
      { type: 'movie', count: 5 },
      { type: 'watchlist_add', count: 3 },
      { type: 'system', count: 40 },
    ])

    expect(families.map((family) => family.label)).toEqual([
      'Content ready',
      'Watchlist',
      'Approvals',
      'Accounts',
    ])
    expect(families[0]?.rows.map((row) => [row.type, row.count])).toEqual([
      ['movie', 5],
      ['episode', 0],
      ['season', 0],
    ])
  })

  it('scales every family to the largest single known type', () => {
    const { maxCount } = groupNotificationTypes([
      { type: 'episode', count: 12 },
      { type: 'approval_auto', count: 30 },
      { type: 'info', count: 99 },
    ])

    expect(maxCount).toBe(30)
  })

  it('marks webhook-only types and families made only of them', () => {
    const { families } = groupNotificationTypes([])
    const webhookOnlyTypes = families
      .flatMap((family) => family.rows)
      .filter((row) => row.webhookOnly)
      .map((row) => row.type)

    expect(webhookOnlyTypes).toEqual([
      'watchlist_removed',
      'approval_resolved',
      'approval_auto',
      'user_created',
    ])
    expect(
      families.filter((family) => family.webhookOnly).map((f) => f.family),
    ).toEqual(['approvals', 'accounts'])
  })
})
