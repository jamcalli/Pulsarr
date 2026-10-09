import {
  filterCount,
  hasFilters,
  parseQueueState,
  type QueueState,
  requestQuery,
  selectionScope,
  serializeQueueState,
  withoutFilters,
  withTab,
} from '@/features/requests/lib/approval-queue/queue-state'

const parse = (query: string) => parseQueueState(new URLSearchParams(query))

describe('parseQueueState', () => {
  it('defaults to pending, oldest first, first page', () => {
    expect(parse('')).toEqual({
      tab: 'pending',
      status: 'all',
      user: null,
      type: null,
      trigger: null,
      q: '',
      sort: 'requested',
      dir: 'asc',
      page: 1,
    })
  })

  it('defaults history to newest first', () => {
    expect(parse('tab=history')).toMatchObject({
      tab: 'history',
      sort: 'requested',
      dir: 'desc',
    })
  })

  it('reads every known value', () => {
    expect(
      parse(
        'tab=history&status=rejected&user=4&type=show&trigger=router_rule&q=dune&sort=status&dir=desc&page=3',
      ),
    ).toEqual({
      tab: 'history',
      status: 'rejected',
      user: 4,
      type: 'show',
      trigger: 'router_rule',
      q: 'dune',
      sort: 'status',
      dir: 'desc',
      page: 3,
    })
  })

  it('falls back on unknown values', () => {
    expect(
      parse(
        'tab=archive&status=nope&user=abc&type=book&trigger=whim&sort=expiresAt&dir=up&page=0',
      ),
    ).toEqual(parse(''))
  })

  it('ignores a status filter and a status sort on pending', () => {
    expect(parse('status=rejected&sort=status&dir=desc')).toMatchObject({
      status: 'all',
      sort: 'requested',
      dir: 'asc',
    })
  })
})

describe('serializeQueueState', () => {
  it('leaves out defaults', () => {
    expect(serializeQueueState(parse('')).toString()).toBe('')
    expect(serializeQueueState(parse('tab=history')).toString()).toBe(
      'tab=history',
    )
  })

  it('round trips a full state', () => {
    const query =
      'tab=history&status=expired&user=4&type=movie&trigger=quota_exceeded&q=dune&sort=title&dir=asc&page=2'
    expect(parseQueueState(serializeQueueState(parse(query)))).toEqual(
      parse(query),
    )
  })
})

describe('selectionScope', () => {
  const base = parse('')
  const changes: Array<[string, QueueState]> = [
    ['tab', withTab(base, 'history')],
    ['user', { ...base, user: 2 }],
    ['type', { ...base, type: 'movie' }],
    ['trigger', { ...base, trigger: 'manual_flag' }],
    ['search', { ...base, q: 'x' }],
    ['sort', { ...base, sort: 'title' }],
    ['direction', { ...base, dir: 'desc' }],
    ['page', { ...base, page: 2 }],
  ]

  it.each(changes)('changes with the %s', (_, next) => {
    expect(selectionScope(next)).not.toBe(selectionScope(base))
  })

  it('changes with the history status', () => {
    const history = withTab(base, 'history')
    expect(selectionScope({ ...history, status: 'approved' })).not.toBe(
      selectionScope(history),
    )
  })
})

describe('withTab and withoutFilters', () => {
  it('keeps filters across tabs and resets sort, status and page', () => {
    const state = parse('user=3&q=dune&sort=title&dir=desc&page=4')
    expect(withTab(state, 'history')).toMatchObject({
      tab: 'history',
      user: 3,
      q: 'dune',
      sort: 'requested',
      dir: 'desc',
      status: 'all',
      page: 1,
    })
  })

  it('clears filters and search back to the first page', () => {
    const state = parse('user=3&type=show&trigger=manual_flag&q=dune&page=2')
    expect(hasFilters(state)).toBe(true)
    expect(filterCount(state)).toBe(3)
    const cleared = withoutFilters(state)
    expect(hasFilters(cleared)).toBe(false)
    expect(cleared.page).toBe(1)
  })

  it('counts a search as a filter but not on the Filters button', () => {
    const state = parse('q=dune')
    expect(hasFilters(state)).toBe(true)
    expect(filterCount(state)).toBe(0)
  })
})

describe('requestQuery', () => {
  it('asks for pending requests on Pending', () => {
    expect(requestQuery(parse(''))).toEqual({
      status: 'pending',
      userId: undefined,
      contentType: undefined,
      triggeredBy: undefined,
      search: undefined,
      sortBy: 'createdAt',
      sortOrder: 'asc',
      limit: 20,
      offset: 0,
    })
  })

  it('asks for every decided status on History', () => {
    expect(requestQuery(parse('tab=history')).status).toBe(
      'approved,rejected,expired,auto_approved',
    )
  })

  it('maps filters, sort and page onto the API', () => {
    expect(
      requestQuery(
        parse(
          'tab=history&status=rejected&user=4&type=show&trigger=router_rule&q=%20dune%20&sort=requester&dir=desc&page=3',
        ),
      ),
    ).toEqual({
      status: 'rejected',
      userId: '4',
      contentType: 'show',
      triggeredBy: 'router_rule',
      search: 'dune',
      sortBy: 'userName',
      sortOrder: 'desc',
      limit: 20,
      offset: 40,
    })
  })
})
