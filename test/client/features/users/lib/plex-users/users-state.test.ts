import {
  filterCount,
  hasFilters,
  parseUsersState,
  selectionScope,
  serializeUsersState,
  type UsersState,
  withoutFilters,
} from '@/features/users/lib/plex-users/users-state'

const parse = (query: string) => parseUsersState(new URLSearchParams(query))

describe('parseUsersState', () => {
  it('defaults to every user by name, first page', () => {
    expect(parse('')).toEqual({
      q: '',
      rel: null,
      sync: null,
      appr: null,
      sort: 'user',
      dir: 'asc',
      page: 1,
    })
  })

  it('reads every known value', () => {
    expect(
      parse(
        'q=maya&rel=friend&sync=off&appr=on&sort=watchlist&dir=desc&page=3',
      ),
    ).toEqual({
      q: 'maya',
      rel: 'friend',
      sync: 'off',
      appr: 'on',
      sort: 'watchlist',
      dir: 'desc',
      page: 3,
    })
  })

  it('falls back on unknown values', () => {
    expect(
      parse('rel=enemy&sync=maybe&appr=yes&sort=age&dir=up&page=0'),
    ).toEqual(parse(''))
  })

  it('ignores a direction without a sort', () => {
    expect(parse('dir=desc')).toMatchObject({ sort: 'user', dir: 'asc' })
  })
})

describe('serializeUsersState', () => {
  it('leaves out defaults', () => {
    expect(serializeUsersState(parse('')).toString()).toBe('')
  })

  it('round-trips every value', () => {
    const query =
      'q=maya&rel=friend&sync=off&appr=on&sort=watchlist&dir=desc&page=3'
    expect(parse(serializeUsersState(parse(query)).toString())).toEqual(
      parse(query),
    )
  })

  it('keeps both sort and direction when only the direction changed', () => {
    expect(serializeUsersState({ ...parse(''), dir: 'desc' }).toString()).toBe(
      'sort=user&dir=desc',
    )
  })
})

describe('filters', () => {
  const filtered: UsersState = {
    ...parse('page=4&sort=watchlist'),
    q: 'maya',
    rel: 'friend',
    sync: 'on',
    appr: null,
  }

  it('counts the select filters but not the search', () => {
    expect(filterCount(filtered)).toBe(2)
    expect(filterCount({ ...parse(''), q: 'maya' })).toBe(0)
  })

  it('treats a search as filtered, but not a blank one', () => {
    expect(hasFilters({ ...parse(''), q: 'maya' })).toBe(true)
    expect(hasFilters({ ...parse(''), q: '   ' })).toBe(false)
    expect(hasFilters(parse(''))).toBe(false)
  })

  it('clears filters and the page but keeps the sort', () => {
    expect(withoutFilters(filtered)).toEqual({
      ...parse(''),
      sort: 'watchlist',
      dir: 'asc',
    })
  })
})

describe('selectionScope', () => {
  it('changes with the page and the filters', () => {
    const base = parse('')
    expect(selectionScope(base, 20)).not.toBe(
      selectionScope({ ...base, page: 2 }, 20),
    )
    expect(selectionScope(base, 20)).not.toBe(
      selectionScope({ ...base, sync: 'on' }, 20),
    )
    expect(selectionScope(base, 20)).toBe(selectionScope(parse(''), 20))
    expect(selectionScope(base, 20)).not.toBe(selectionScope(base, 10))
  })
})
