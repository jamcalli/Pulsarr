import {
  parseWatchlistState,
  serializeWatchlistState,
  visibleItems,
} from '@/features/users/lib/user/watchlist-state'
import type { RecentRequest } from '@/lib/media-item'

const parse = (query: string) => parseWatchlistState(new URLSearchParams(query))

function item(
  id: number,
  title: string,
  status: RecentRequest['status'],
  createdAt: string,
): RecentRequest {
  return {
    id,
    source: 'watchlist',
    title,
    key: `key-${id}`,
    contentType: 'movie',
    guids: [`tmdb:${id}`],
    thumb: null,
    status,
    userId: 2,
    userName: 'mayar88',
    createdAt,
    primaryInstance: null,
    allInstances: [],
  }
}

const items = [
  item(1, 'Past Lives', 'grabbed', '2026-10-08T00:00:00Z'),
  item(2, 'Dune: Part Two', 'notified', '2026-10-10T00:00:00Z'),
  item(3, 'Dune', 'pending', '2026-10-05T00:00:00Z'),
]

describe('parseWatchlistState', () => {
  it('defaults to every item, first page', () => {
    expect(parse('')).toEqual({ q: '', status: null, page: 1 })
  })

  it('reads every known value', () => {
    expect(parse('q=dune&status=grabbed&page=2')).toEqual({
      q: 'dune',
      status: 'grabbed',
      page: 2,
    })
  })

  it('falls back on unknown values', () => {
    expect(parse('status=lost&page=-1')).toEqual(parse(''))
  })
})

describe('serializeWatchlistState', () => {
  it('leaves out defaults', () => {
    expect(serializeWatchlistState(parse('')).toString()).toBe('')
  })

  it('round-trips every value', () => {
    const query = 'q=dune&status=grabbed&page=2'
    expect(serializeWatchlistState(parse(query)).toString()).toBe(query)
  })
})

describe('visibleItems', () => {
  it('sorts newest first', () => {
    expect(visibleItems(items, parse('')).map((row) => row.id)).toEqual([
      2, 1, 3,
    ])
  })

  it('matches the title case-insensitively, ignoring outer spaces', () => {
    expect(
      visibleItems(items, { ...parse(''), q: '  DUNE ' }).map((row) => row.id),
    ).toEqual([2, 3])
  })

  it('narrows by status and search together', () => {
    expect(
      visibleItems(items, { q: 'dune', status: 'pending', page: 1 }).map(
        (row) => row.id,
      ),
    ).toEqual([3])
  })
})
