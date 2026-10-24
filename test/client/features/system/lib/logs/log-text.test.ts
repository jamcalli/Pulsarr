import {
  logEntryText,
  logExportFileName,
  logLinesText,
} from '@/features/system/lib/logs/log-text'
import { plainLine, sentHope } from '../../../../log-fixtures.js'

const localTime = new Date(2026, 9, 15, 21, 17, 2, 364).toISOString()
const line = { ...plainLine, timestamp: localTime }
const withData = { ...sentHope, timestamp: localTime }
const STAMP = '\\[2026-10-15 21:17:02 [+-]\\d{4}\\]'

describe('log text', () => {
  it('writes a line with its local time, level and module', () => {
    expect(logEntryText(line)).toMatch(
      new RegExp(
        `^${STAMP} INFO: \\[RADARR\\] Bulk updated tags for 1 movies across 1 tag groups \\(mode: add\\)$`,
      ),
    )
  })

  it('indents each field under the line, strings quoted', () => {
    const [head, ...fields] = logEntryText(withData).split('\n')
    expect(head).toMatch(
      new RegExp(`^${STAMP} INFO: \\[RADARR\\] Sent Hope to Radarr$`),
    )
    expect(fields).toEqual([
      '    title: "Hope"',
      '    qualityProfileId: 13',
      '    rootFolder: "/mnt/plex/nzb-movies"',
      '    searchOnAdd: true',
    ])
  })

  it('separates lines with a blank line', () => {
    expect(logLinesText([plainLine, sentHope])).toBe(
      `${logEntryText(plainLine)}\n\n${logEntryText(sentHope)}`,
    )
  })

  it('names the export file by the UTC time', () => {
    expect(logExportFileName(new Date('2026-10-15T21:17:03.315Z'))).toBe(
      'pulsarr-logs-2026-10-15-21-17-03.txt',
    )
  })
})
