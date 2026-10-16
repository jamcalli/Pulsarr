import {
  appendEntries,
  clearBuffer,
  EMPTY_LOG_BUFFER,
  lineData,
  lineEntries,
  MAX_LOG_LINES,
  markResumed,
} from '@/features/system/lib/logs/log-buffer'
import {
  infoLine,
  pingFailed,
  plainLine,
  sentHope,
} from '../../../../log-fixtures.js'

function lines(from: number, count: number) {
  return Array.from({ length: count }, (_, index) => infoLine(from + index))
}

describe('log buffer', () => {
  it('appends lines in order with unique ids', () => {
    const buffer = appendEntries(appendEntries(EMPTY_LOG_BUFFER, [plainLine]), [
      sentHope,
    ])
    expect(lineEntries(buffer.rows)).toEqual([plainLine, sentHope])
    expect(new Set(buffer.rows.map((row) => row.id)).size).toBe(2)
  })

  it('keeps only the newest lines past the cap', () => {
    const full = appendEntries(EMPTY_LOG_BUFFER, lines(0, MAX_LOG_LINES))
    const next = appendEntries(full, lines(MAX_LOG_LINES, 5))

    expect(next.lineCount).toBe(MAX_LOG_LINES)
    expect(next.rows).toHaveLength(MAX_LOG_LINES)
    expect(lineEntries(next.rows)[0]).toEqual(infoLine(5))
    expect(lineEntries(next.rows).at(-1)).toEqual(infoLine(MAX_LOG_LINES + 4))
  })

  it('puts a gap row between the last line before a pause and the first after', () => {
    const resumed = markResumed(appendEntries(EMPTY_LOG_BUFFER, [plainLine]))
    const next = appendEntries(resumed, [pingFailed, sentHope])

    expect(next.rows.map((row) => row.kind)).toEqual([
      'line',
      'gap',
      'line',
      'line',
    ])
    expect(next.rows[1]).toMatchObject({
      from: plainLine.timestamp,
      to: pingFailed.timestamp,
    })
    expect(lineEntries(next.rows)).toEqual([plainLine, pingFailed, sentHope])
  })

  it('adds no gap row when nothing was on the page before the pause', () => {
    const next = appendEntries(markResumed(EMPTY_LOG_BUFFER), [plainLine])
    expect(next.rows.map((row) => row.kind)).toEqual(['line'])
  })

  it('drops a gap row whose earlier line fell off the top', () => {
    const resumed = markResumed(appendEntries(EMPTY_LOG_BUFFER, lines(0, 1)))
    const withGap = appendEntries(resumed, lines(1, MAX_LOG_LINES - 1))
    const next = appendEntries(withGap, lines(MAX_LOG_LINES, 1))

    expect(next.rows[0]?.kind).toBe('line')
    expect(next.rows.some((row) => row.kind === 'gap')).toBe(false)
  })

  it('clears the lines but keeps ids growing', () => {
    const buffer = appendEntries(EMPTY_LOG_BUFFER, [plainLine])
    const cleared = clearBuffer(buffer)
    const next = appendEntries(cleared, [sentHope])

    expect(cleared.rows).toEqual([])
    expect(next.rows[0]?.id).not.toBe(buffer.rows[0]?.id)
  })

  it('opens only lines that carry fields', () => {
    const { rows } = appendEntries(EMPTY_LOG_BUFFER, [
      plainLine,
      sentHope,
      { ...plainLine, data: {} },
    ])
    expect(rows.map((row) => lineData(row) !== null)).toEqual([
      false,
      true,
      false,
    ])
  })
})
