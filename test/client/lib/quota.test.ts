import { setFormatLocale } from '@/lib/format'
import { quotaWindowPhrase } from '@/lib/quota'
import type { components } from '@/types/api.js'

type QuotaSettings = components['schemas']['QuotaSettings']

function settings({
  resetDays = 7,
  resetDay = 1,
  handleMonthEnd = 'last-day',
}: {
  resetDays?: number
  resetDay?: number
  handleMonthEnd?: QuotaSettings['monthly']['handleMonthEnd']
} = {}): QuotaSettings {
  return {
    cleanup: { enabled: true, retentionDays: 90 },
    weeklyRolling: { resetDays },
    monthly: { resetDay, handleMonthEnd },
  }
}

describe('quotaWindowPhrase', () => {
  beforeEach(() => setFormatLocale('en-US'))
  afterEach(() => setFormatLocale(undefined))

  it('reads today for a daily quota with or without settings', () => {
    expect(quotaWindowPhrase('daily', settings())).toBe('today')
    expect(quotaWindowPhrase('daily', null)).toBe('today')
  })

  it('counts the configured weekly rolling days', () => {
    expect(quotaWindowPhrase('weekly_rolling', settings())).toBe(
      'in the last 7 days',
    )
    expect(
      quotaWindowPhrase('weekly_rolling', settings({ resetDays: 14 })),
    ).toBe('in the last 14 days')
  })

  it('reads today for a one day rolling window', () => {
    expect(
      quotaWindowPhrase('weekly_rolling', settings({ resetDays: 1 })),
    ).toBe('today')
  })

  it('reads this month when the month resets on the 1st', () => {
    expect(quotaWindowPhrase('monthly', settings())).toBe('this month')
  })

  it('names a reset day every month has', () => {
    expect(quotaWindowPhrase('monthly', settings({ resetDay: 2 }))).toBe(
      'since the 2nd',
    )
    expect(quotaWindowPhrase('monthly', settings({ resetDay: 28 }))).toBe(
      'since the 28th',
    )
  })

  it.each(['last-day', 'skip-month', 'next-month'] as const)(
    'stays unnamed for a reset day past the 28th with %s',
    (handleMonthEnd) => {
      expect(
        quotaWindowPhrase(
          'monthly',
          settings({ resetDay: 29, handleMonthEnd }),
        ),
      ).toBe('since the monthly reset')
      expect(
        quotaWindowPhrase(
          'monthly',
          settings({ resetDay: 31, handleMonthEnd }),
        ),
      ).toBe('since the monthly reset')
    },
  )

  it('falls back to a neutral phrase before settings load', () => {
    expect(quotaWindowPhrase('weekly_rolling', null)).toBe(
      'in the current period',
    )
    expect(quotaWindowPhrase('monthly', null)).toBe('in the current period')
  })
})
