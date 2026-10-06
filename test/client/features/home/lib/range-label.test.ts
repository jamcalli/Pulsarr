import { rangeLabel } from '@/features/home/lib/range-label'
import { setFormatLocale } from '@/lib/format'

describe('rangeLabel', () => {
  beforeEach(() => setFormatLocale('en-US'))
  afterEach(() => setFormatLocale(undefined))

  it('reads all time for a zero-day range', () => {
    expect(rangeLabel(0)).toBe('All time')
  })

  it('counts the days with the matching plural', () => {
    expect(rangeLabel(1)).toBe('Last 1 day')
    expect(rangeLabel(30)).toBe('Last 30 days')
  })
})
