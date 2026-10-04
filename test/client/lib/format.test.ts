import {
  formatCount,
  formatNumber,
  formatTime,
  setFormatLocale,
} from '@/lib/format'

describe('format', () => {
  afterEach(() => setFormatLocale(undefined))

  it('pluralizes by locale rules with a formatted number', () => {
    setFormatLocale('en-US')
    expect(formatCount(1, 'tag')).toBe('1 tag')
    expect(formatCount(2686, 'tagged item')).toBe('2,686 tagged items')
    expect(formatCount(0, 'instance')).toBe('0 instances')
    expect(formatCount(3, 'child', 'children')).toBe('3 children')
  })

  it('follows the configured locale', () => {
    setFormatLocale('de-DE')
    expect(formatNumber(2686)).toBe('2.686')
    expect(formatTime(new Date(2026, 9, 4, 14, 5, 9))).toBe('14:05:09')
  })
})
