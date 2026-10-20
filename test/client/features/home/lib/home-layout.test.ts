import {
  DEFAULT_HOME_ROWS,
  fitsRow,
  normalizeRows,
} from '@/features/home/lib/home-layout'

describe('normalizeRows', () => {
  it('keeps the default rows as the original page shape', () => {
    expect(normalizeRows(DEFAULT_HOME_ROWS)).toEqual([
      { cards: ['approvals', 'most-active'], fill: true },
      { cards: ['recent-requests'], fill: true },
      { cards: ['popularity-rankings'], fill: true },
      { cards: ['pipeline'], fill: true },
      { cards: ['request-to-ready', 'notifications'], fill: true },
      { cards: ['top-genres', 'library-mix'], fill: true },
    ])
  })

  it('splits three halves into two rows', () => {
    expect(
      normalizeRows([['approvals', 'library-mix', 'notifications']]),
    ).toEqual([
      { cards: ['approvals', 'library-mix'], fill: true },
      { cards: ['notifications'], fill: true },
    ])
  })

  it('splits a full card away from a half beside it', () => {
    expect(normalizeRows([['library-mix', 'pipeline']])).toEqual([
      { cards: ['library-mix'], fill: false },
      { cards: ['pipeline'], fill: true },
    ])
    expect(normalizeRows([['pipeline', 'approvals']])).toEqual([
      { cards: ['pipeline'], fill: true },
      { cards: ['approvals'], fill: true },
    ])
  })

  it('never pairs halves across input rows', () => {
    expect(normalizeRows([['approvals'], ['library-mix']])).toEqual([
      { cards: ['approvals'], fill: true },
      { cards: ['library-mix'], fill: false },
    ])
  })

  it('drops empty rows', () => {
    expect(normalizeRows([[], ['pipeline'], []])).toEqual([
      { cards: ['pipeline'], fill: true },
    ])
  })

  it('fills a lone half-grow and leaves a lone half its slot', () => {
    expect(
      normalizeRows([
        ['top-genres'],
        ['request-to-ready'],
        ['recent-requests'],
      ]),
    ).toEqual([
      { cards: ['top-genres'], fill: true },
      { cards: ['request-to-ready'], fill: false },
      { cards: ['recent-requests'], fill: true },
    ])
  })
})

describe('fitsRow', () => {
  it('accepts an empty row, a lone card and a pair of halves', () => {
    expect(fitsRow([])).toBe(true)
    expect(fitsRow(['pipeline'])).toBe(true)
    expect(fitsRow(['approvals', 'library-mix'])).toBe(true)
  })

  it('rejects a full card sharing a row and a third card', () => {
    expect(fitsRow(['pipeline', 'approvals'])).toBe(false)
    expect(fitsRow(['approvals', 'most-active', 'top-genres'])).toBe(false)
  })
})
