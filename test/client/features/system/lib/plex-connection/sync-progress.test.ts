import type { WatchlistSyncMetadata } from '@root/types/progress.types'
import { formatSyncProgress } from '@/features/system/lib/plex-connection/sync-progress'
import { setFormatLocale } from '@/lib/format'

function counted(
  done: number,
  total: number,
  unit: 'pages' | 'friends' | 'items',
): WatchlistSyncMetadata {
  return { stage: 'reading', count: { done, total, unit } }
}

describe('formatSyncProgress', () => {
  beforeEach(() => setFormatLocale('en-US'))
  afterEach(() => setFormatLocale(undefined))

  it('reads the count with its unit', () => {
    expect(formatSyncProgress(40, counted(3, 7, 'pages'))).toBe('3 of 7 pages')
    expect(formatSyncProgress(50, counted(4, 12, 'friends'))).toBe(
      '4 of 12 friends',
    )
    expect(formatSyncProgress(80, counted(40, 1520, 'items'))).toBe(
      '40 of 1,520 items',
    )
  })

  it('uses the singular unit when the total is one', () => {
    expect(formatSyncProgress(100, counted(1, 1, 'friends'))).toBe(
      '1 of 1 friend',
    )
  })

  it('falls back to the percent without a count', () => {
    expect(
      formatSyncProgress(25, { stage: 'finding-friends', count: null }),
    ).toBe('25%')
    expect(formatSyncProgress(0, undefined)).toBe('0%')
    expect(formatSyncProgress(60, { status: 'running' })).toBe('60%')
  })
})
