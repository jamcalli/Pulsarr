import {
  expansionScope,
  filterCount,
  hasFilters,
  parseShowsState,
  serializeShowsState,
  withoutFilters,
} from '@/features/library/lib/session-monitoring/shows-state'

describe('shows state', () => {
  it('defaults to the most recent activity first', () => {
    expect(parseShowsState(new URLSearchParams())).toEqual({
      q: '',
      mode: null,
      status: null,
      sort: 'last',
      dir: 'desc',
      page: 1,
    })
  })

  it('drops unknown values and round-trips known ones', () => {
    const state = parseShowsState(
      new URLSearchParams(
        'q=dark&mode=pilotRolling&status=inactive&sort=season&dir=asc&page=2',
      ),
    )
    expect(serializeShowsState(state).toString()).toBe(
      'q=dark&mode=pilotRolling&status=inactive&sort=season&dir=asc&page=2',
    )
    expect(
      parseShowsState(new URLSearchParams('mode=pilot&status=gone&sort=x')),
    ).toMatchObject({ mode: null, status: null, sort: 'last', dir: 'desc' })
  })

  it('clears the search and filters but keeps the sort', () => {
    const state = parseShowsState(
      new URLSearchParams('q=dark&mode=pilotRolling&sort=show&dir=asc&page=3'),
    )
    expect(hasFilters(state)).toBe(true)
    expect(filterCount(state)).toBe(1)
    const cleared = withoutFilters(state)
    expect(hasFilters(cleared)).toBe(false)
    expect(serializeShowsState(cleared).toString()).toBe('sort=show&dir=asc')
  })

  it('changes the expansion scope with the page size', () => {
    const state = parseShowsState(new URLSearchParams())
    expect(expansionScope(state, 10)).not.toBe(expansionScope(state, 20))
  })
})
