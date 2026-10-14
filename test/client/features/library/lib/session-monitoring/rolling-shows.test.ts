import {
  groupRollingShows,
  inactiveShowKeys,
  isInactive,
  lastSession,
  type RollingRecord,
  type RollingShowRow,
  SHOW_SORT_VALUES,
  seasonLabel,
  visibleShows,
} from '@/features/library/lib/session-monitoring/rolling-shows'
import {
  parseShowsState,
  type ShowsState,
} from '@/features/library/lib/session-monitoring/shows-state'
import { setFormatLocale } from '@/lib/format'

function record(overrides: Partial<RollingRecord>): RollingRecord {
  return {
    id: 1,
    sonarr_series_id: 10,
    show_title: 'Severance',
    monitoring_type: 'pilotRolling',
    current_monitored_season: 1,
    last_watched_season: 0,
    last_watched_episode: 0,
    last_session_date: null,
    sonarr_instance_id: 1,
    plex_user_id: null,
    plex_username: null,
    created_at: '2026-02-09T00:00:00Z',
    updated_at: '2026-02-09T00:00:00Z',
    last_updated_at: '2026-02-09T00:00:00Z',
    ...overrides,
  }
}

function row(
  overrides: Partial<RollingRecord>,
  extra: Partial<RollingShowRow> = {},
): RollingShowRow {
  return {
    record: record(overrides),
    viewers: [],
    instanceName: 'Sonarr',
    inactive: false,
    ...extra,
  }
}

const DEFAULT_STATE: ShowsState = parseShowsState(new URLSearchParams())

describe('groupRollingShows', () => {
  it('nests each viewer row under its show, newest session first', () => {
    const shows = groupRollingShows([
      record({ id: 1 }),
      record({
        id: 2,
        plex_user_id: 'u1',
        plex_username: 'maya',
        last_session_date: '2026-10-01T00:00:00Z',
      }),
      record({ id: 3, sonarr_series_id: 20, show_title: 'Andor' }),
      record({
        id: 4,
        plex_user_id: 'u2',
        plex_username: 'lukas',
        last_session_date: '2026-10-10T00:00:00Z',
      }),
      record({
        id: 5,
        sonarr_instance_id: 2,
        plex_user_id: 'u3',
        plex_username: 'theo',
      }),
    ])

    expect(shows.map((show) => show.record.id)).toEqual([1, 3])
    expect(shows[0]?.viewers.map((viewer) => viewer.id)).toEqual([4, 2])
    expect(shows[1]?.viewers).toEqual([])
  })
})

describe('inactive shows', () => {
  it('matches a listed viewer row to its show', () => {
    const [show] = groupRollingShows([record({ id: 1 })])
    const keys = inactiveShowKeys([record({ id: 9, plex_user_id: 'u1' })])
    expect(show && isInactive(show, keys)).toBe(true)
  })

  it('keeps the same series on another instance active', () => {
    const [show] = groupRollingShows([record({ id: 1 })])
    const keys = inactiveShowKeys([record({ sonarr_instance_id: 2 })])
    expect(show && isInactive(show, keys)).toBe(false)
  })
})

describe('seasonLabel', () => {
  beforeEach(() => setFormatLocale('en-US'))
  afterEach(() => setFormatLocale(undefined))

  it('reads Pilots only for an all season pilot show at season 0', () => {
    expect(
      seasonLabel(
        record({
          monitoring_type: 'allSeasonPilotRolling',
          current_monitored_season: 0,
        }),
      ),
    ).toBe('Pilots only')
  })

  it('reads the monitored season otherwise', () => {
    expect(
      seasonLabel(
        record({
          monitoring_type: 'allSeasonPilotRolling',
          current_monitored_season: 3,
        }),
      ),
    ).toBe('Season 3')
    expect(seasonLabel(record({ current_monitored_season: 2 }))).toBe(
      'Season 2',
    )
  })
})

describe('SHOW_SORT_VALUES', () => {
  it('orders modes pilot, first season, then all season pilot', () => {
    const values = (
      ['allSeasonPilotRolling', 'pilotRolling', 'firstSeasonRolling'] as const
    ).map((mode) => SHOW_SORT_VALUES.mode(row({ monitoring_type: mode })))
    expect(values).toEqual([2, 0, 1])
  })

  it('puts Pilots only before season 1', () => {
    const pilots = row({
      monitoring_type: 'allSeasonPilotRolling',
      current_monitored_season: 0,
    })
    expect(SHOW_SORT_VALUES.season(pilots)).toBe(-1)
    expect(SHOW_SORT_VALUES.season(row({ current_monitored_season: 1 }))).toBe(
      1,
    )
  })

  it('counts viewers and falls back to the enrollment time without one', () => {
    const watched = row(
      {},
      {
        viewers: [
          record({ id: 2, last_session_date: '2026-10-10T00:00:00Z' }),
          record({ id: 3, last_session_date: '2026-10-01T00:00:00Z' }),
        ],
      },
    )
    expect(SHOW_SORT_VALUES.viewers(watched)).toBe(2)
    expect(SHOW_SORT_VALUES.last(watched)).toBe(
      Date.parse('2026-10-10T00:00:00Z'),
    )
    expect(lastSession(row({}))).toBeNull()
    expect(SHOW_SORT_VALUES.last(row({}))).toBe(
      Date.parse('2026-02-09T00:00:00Z'),
    )
  })
})

describe('visibleShows', () => {
  const rows = [
    row({ id: 1, show_title: 'Severance', monitoring_type: 'pilotRolling' }),
    row(
      { id: 2, show_title: 'Andor', monitoring_type: 'firstSeasonRolling' },
      { inactive: true },
    ),
    row({ id: 3, show_title: 'Silo', monitoring_type: 'pilotRolling' }),
  ]

  it('filters by title, mode and status', () => {
    const ids = (state: Partial<ShowsState>) =>
      visibleShows(rows, {
        ...DEFAULT_STATE,
        sort: 'show',
        dir: 'asc',
        ...state,
      }).map((show) => show.record.id)

    expect(ids({ q: 'sil' })).toEqual([3])
    expect(ids({ mode: 'pilotRolling' })).toEqual([1, 3])
    expect(ids({ status: 'inactive' })).toEqual([2])
    expect(ids({ status: 'active' })).toEqual([1, 3])
  })

  it('sorts in the chosen direction with the title as tiebreak', () => {
    const titles = visibleShows(rows, {
      ...DEFAULT_STATE,
      sort: 'mode',
      dir: 'desc',
    }).map((show) => show.record.show_title)
    expect(titles).toEqual(['Andor', 'Severance', 'Silo'])
  })
})
