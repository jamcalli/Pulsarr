import {
  DEFAULT_HOME_ROWS,
  HOME_CARD_IDS,
} from '@/features/home/lib/home-layout'
import { parseHomeLayout, visibleRows } from '@/features/home/lib/home-prefs'

const defaultRows = DEFAULT_HOME_ROWS.map((row) => [...row])

describe('parseHomeLayout', () => {
  it('keeps a complete saved layout as is', () => {
    const rows = [...defaultRows].reverse()
    expect(
      parseHomeLayout(JSON.stringify({ rows, hidden: ['notifications'] })),
    ).toEqual({ rows, hidden: ['notifications'] })
  })

  it('drops unknown ids and the rows they empty', () => {
    const layout = parseHomeLayout(
      JSON.stringify({
        rows: [['retired'], ...defaultRows, ['retired', 'gone']],
        hidden: ['retired', 'pipeline'],
      }),
    )
    expect(layout).toEqual({ rows: defaultRows, hidden: ['pipeline'] })
  })

  it('appends cards missing from rows and hidden as their own rows', () => {
    const layout = parseHomeLayout(
      JSON.stringify({
        rows: [['approvals', 'most-active']],
        hidden: ['pipeline'],
      }),
    )
    const missing = HOME_CARD_IDS.filter(
      (id) => !['approvals', 'most-active', 'pipeline'].includes(id),
    )
    expect(layout).toEqual({
      rows: [['approvals', 'most-active'], ...missing.map((id) => [id])],
      hidden: ['pipeline'],
    })
  })

  it('dedupes ids across rows and within hidden', () => {
    const layout = parseHomeLayout(
      JSON.stringify({
        rows: [...defaultRows, ['pipeline', 'approvals']],
        hidden: ['library-mix', 'library-mix'],
      }),
    )
    expect(layout).toEqual({ rows: defaultRows, hidden: ['library-mix'] })
  })

  it.each([
    ['non-JSON', 'not json'],
    ['a primitive', '42'],
    ['null', 'null'],
    ['an array', '[]'],
    ['a missing hidden list', JSON.stringify({ rows: [] })],
    ['the old order shape', JSON.stringify({ order: [], hidden: [] })],
    ['a flat rows list', JSON.stringify({ rows: ['pipeline'], hidden: [] })],
    ['non-string ids', JSON.stringify({ rows: [[1]], hidden: [] })],
  ])('rejects %s', (_, raw) => {
    expect(parseHomeLayout(raw)).toBeUndefined()
  })
})

describe('visibleRows', () => {
  it('removes hidden cards and regroups what is left', () => {
    expect(
      visibleRows({
        rows: [['approvals', 'most-active'], ['pipeline']],
        hidden: ['most-active'],
      }),
    ).toEqual([
      { cards: ['approvals'], fill: true },
      { cards: ['pipeline'], fill: true },
    ])
  })
})
