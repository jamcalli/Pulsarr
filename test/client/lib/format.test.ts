import {
  formatCount,
  formatCurrency,
  formatLanguage,
  formatNumber,
  formatPercent,
  formatRelative,
  formatRuntime,
  formatTime,
  formatYear,
  pluralize,
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

  it('picks the word alone for a value shown elsewhere', () => {
    setFormatLocale('en-US')
    expect(pluralize(1, 'hour')).toBe('hour')
    expect(pluralize(1.5, 'hour')).toBe('hours')
  })

  it('follows the configured locale', () => {
    setFormatLocale('de-DE')
    expect(formatNumber(2686)).toBe('2.686')
    expect(formatTime(new Date(2026, 9, 4, 14, 5, 9))).toBe('14:05:09')
  })

  it('describes a past moment relative to now', () => {
    setFormatLocale('en-US')
    const now = new Date(2026, 9, 4, 14, 0, 0).getTime()
    const minute = 60 * 1000
    const day = 24 * 60 * minute
    expect(formatRelative(now - 20 * 1000, now)).toBe('just now')
    expect(formatRelative(now - 5 * minute, now)).toBe('5 minutes ago')
    expect(formatRelative(now - day, now)).toBe('yesterday')
    expect(formatRelative(new Date(now - 2 * day), now)).toBe('2 days ago')
  })

  it('formats a ratio as a percent', () => {
    setFormatLocale('en-US')
    expect(formatPercent(0.4267)).toBe('43%')
    expect(formatPercent(0.4267, 1)).toBe('42.7%')
  })

  it('fixes the decimals when asked', () => {
    setFormatLocale('en-US')
    expect(formatNumber(7, 1)).toBe('7.0')
    expect(formatNumber(7.26, 1)).toBe('7.3')
    expect(formatNumber(7.26)).toBe('7.26')
  })

  it('formats whole currency amounts', () => {
    setFormatLocale('en-US')
    expect(formatCurrency(165000000, 'USD')).toBe('$165,000,000')
    setFormatLocale('de-DE')
    expect(formatCurrency(1500, 'USD')).toBe('1.500\u00a0$')
  })

  it('names a language code in the configured locale', () => {
    setFormatLocale('en-US')
    expect(formatLanguage('ja')).toBe('Japanese')
    setFormatLocale('de-DE')
    expect(formatLanguage('en')).toBe('Englisch')
  })

  it('falls back to the code for a language it cannot name', () => {
    setFormatLocale('en-US')
    expect(formatLanguage('not a code')).toBe('NOT A CODE')
  })

  it('formats years', () => {
    setFormatLocale('en-US')
    expect(formatYear(new Date(2019, 5, 1))).toBe('2019')
  })

  it('formats a runtime in hours and minutes', () => {
    setFormatLocale('en-US')
    expect(formatRuntime(45)).toBe('45 min')
    expect(formatRuntime(120)).toBe('2 hr')
    expect(formatRuntime(135)).toBe('2 hr 15 min')
  })
})
