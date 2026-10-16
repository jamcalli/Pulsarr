import {
  appendEntries,
  EMPTY_LOG_BUFFER,
  lineEntries,
  markResumed,
} from '@/features/system/lib/logs/log-buffer'
import {
  filterLogRows,
  hasLogFilters,
  NO_LOG_FILTERS,
  splitMatches,
} from '@/features/system/lib/logs/log-filter'
import {
  authRequired,
  pingFailed,
  plainLine,
  sentHope,
} from '../../../../log-fixtures.js'

const { rows } = appendEntries(EMPTY_LOG_BUFFER, [
  plainLine,
  sentHope,
  authRequired,
  pingFailed,
])

describe('filterLogRows', () => {
  it('returns every row without filters', () => {
    expect(filterLogRows(rows, NO_LOG_FILTERS)).toBe(rows)
    expect(hasLogFilters(NO_LOG_FILTERS)).toBe(false)
    expect(hasLogFilters({ q: '   ', level: null })).toBe(false)
  })

  it('keeps lines at or above the level threshold', () => {
    expect(lineEntries(filterLogRows(rows, { q: '', level: 'warn' }))).toEqual([
      authRequired,
      pingFailed,
    ])
    expect(lineEntries(filterLogRows(rows, { q: '', level: 'error' }))).toEqual(
      [pingFailed],
    )
  })

  it('searches level, module, message and data without case', () => {
    const search = (q: string) =>
      lineEntries(filterLogRows(rows, { q, level: null }))
    expect(search('HOPE')).toEqual([sentHope])
    expect(search('radarr')).toEqual([plainLine, sentHope])
    expect(search('req-141')).toEqual([authRequired])
    expect(search('warn')).toEqual([authRequired])
    expect(search(' nothing like this ')).toEqual([])
  })

  it('combines search and level', () => {
    expect(
      lineEntries(filterLogRows(rows, { q: 'plex', level: 'error' })),
    ).toEqual([pingFailed])
  })

  it('keeps gap rows among the matches', () => {
    const resumed = appendEntries(
      markResumed(appendEntries(EMPTY_LOG_BUFFER, [plainLine])),
      [sentHope],
    )
    const kinds = filterLogRows(resumed.rows, { q: 'hope', level: null }).map(
      (row) => row.kind,
    )
    expect(kinds).toEqual(['gap', 'line'])
  })
})

describe('splitMatches', () => {
  it('splits around every match and keeps the original case', () => {
    expect(splitMatches('Sent Hope, hope', 'hope')).toEqual([
      { text: 'Sent ', match: false, start: 0 },
      { text: 'Hope', match: true, start: 5 },
      { text: ', ', match: false, start: 9 },
      { text: 'hope', match: true, start: 11 },
    ])
  })

  it('returns the text whole without a match', () => {
    expect(splitMatches('Sent Hope', 'xyz')).toEqual([
      { text: 'Sent Hope', match: false, start: 0 },
    ])
  })
})
