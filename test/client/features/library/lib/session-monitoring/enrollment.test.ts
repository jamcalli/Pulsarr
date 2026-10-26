import {
  bulkEnrollPayload,
  type EnrollableShow,
  enrollableId,
  visibleEnrollable,
} from '@/features/library/lib/session-monitoring/enrollment'

function show(overrides: Partial<EnrollableShow>): EnrollableShow {
  return {
    watchlistId: 1,
    sonarrInstanceId: 1,
    sonarrSeriesId: 10,
    title: 'Severance',
    guids: ['tvdb:371980'],
    rollingShowId: null,
    monitoringType: null,
    ...overrides,
  }
}

const shows = [
  show({ title: 'Ted Lasso', sonarrSeriesId: 11 }),
  show({ title: 'Barry', sonarrSeriesId: 12, sonarrInstanceId: 2 }),
  show({ title: 'Andor', sonarrSeriesId: 13, rollingShowId: 5 }),
]

describe('visibleEnrollable', () => {
  it('sorts by title and filters by title and instance', () => {
    const titles = (filter: { q: string; instanceId: number | null }) =>
      visibleEnrollable(shows, filter).map((entry) => entry.title)

    expect(titles({ q: '', instanceId: null })).toEqual([
      'Andor',
      'Barry',
      'Ted Lasso',
    ])
    expect(titles({ q: 'TED', instanceId: null })).toEqual(['Ted Lasso'])
    expect(titles({ q: '', instanceId: 2 })).toEqual(['Barry'])
  })
})

describe('enrollableId', () => {
  it('tells the same series on two instances apart', () => {
    expect(enrollableId(show({ sonarrInstanceId: 1 }))).not.toBe(
      enrollableId(show({ sonarrInstanceId: 2 })),
    )
  })
})

describe('bulkEnrollPayload', () => {
  it('sends each show with its rolling id, the mode and the start over flag', () => {
    expect(
      bulkEnrollPayload(shows.slice(2), 'firstSeasonRolling', true),
    ).toEqual({
      shows: [
        {
          sonarrSeriesId: 13,
          sonarrInstanceId: 1,
          title: 'Andor',
          guids: ['tvdb:371980'],
          rollingShowId: 5,
        },
      ],
      monitoringType: 'firstSeasonRolling',
      resetMonitoring: true,
    })
  })
})
