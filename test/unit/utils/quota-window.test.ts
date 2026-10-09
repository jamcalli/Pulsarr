import {
  longestQuotaWindowDays,
  type QuotaWindowSettings,
  quotaResetDate,
  quotaWindow,
  resolveQuotaWindowSettings,
} from '@utils/quota-window.js'
import { describe, expect, it } from 'vitest'

const at = (date: string) => new Date(`${date}T12:00:00`)

const settings = (
  overrides: Partial<QuotaWindowSettings> = {},
): QuotaWindowSettings => ({
  weeklyRollingDays: 7,
  monthlyResetDay: 1,
  monthEnd: 'last-day',
  ...overrides,
})

describe('quota-window', () => {
  describe('resolveQuotaWindowSettings', () => {
    it('applies defaults when settings are missing', () => {
      expect(resolveQuotaWindowSettings(undefined)).toEqual({
        weeklyRollingDays: 7,
        monthlyResetDay: 1,
        monthEnd: 'last-day',
      })
    })

    it('reads stored values', () => {
      expect(
        resolveQuotaWindowSettings({
          cleanup: { enabled: true, retentionDays: 90 },
          weeklyRolling: { resetDays: 14 },
          monthly: { resetDay: 31, handleMonthEnd: 'skip-month' },
        }),
      ).toEqual({
        weeklyRollingDays: 14,
        monthlyResetDay: 31,
        monthEnd: 'skip-month',
      })
    })
  })

  describe('daily', () => {
    it('covers today and resets tomorrow', () => {
      expect(quotaWindow('daily', at('2027-02-28'), settings())).toEqual({
        start: '2027-02-28',
        nextReset: '2027-03-01',
      })
    })

    it('rolls over the year', () => {
      expect(
        quotaWindow('daily', new Date(2026, 11, 31, 23, 59), settings()),
      ).toEqual({ start: '2026-12-31', nextReset: '2027-01-01' })
    })
  })

  describe('weekly_rolling', () => {
    it.each([
      [1, '2027-03-16', '2027-03-16'],
      [7, '2027-03-16', '2027-03-10'],
      [7, '2027-11-10', '2027-11-04'],
      [30, '2027-01-10', '2026-12-12'],
    ])('N=%i on %s starts %s', (days, today, start) => {
      expect(
        quotaWindow(
          'weekly_rolling',
          at(today),
          settings({ weeklyRollingDays: days }),
        ),
      ).toEqual({ start, nextReset: null })
    })

    it('defaults to a 7-day window ending today', () => {
      expect(
        quotaWindow(
          'weekly_rolling',
          at('2027-03-16'),
          resolveQuotaWindowSettings(undefined),
        ).start,
      ).toBe('2027-03-10')
    })
  })

  describe('monthly', () => {
    it('defaults to the month starting on the 1st', () => {
      expect(
        quotaWindow(
          'monthly',
          at('2027-02-15'),
          resolveQuotaWindowSettings(undefined),
        ),
      ).toEqual({ start: '2027-02-01', nextReset: '2027-03-01' })
    })

    it('starts a new period on the reset date itself', () => {
      expect(quotaWindow('monthly', at('2027-03-01'), settings())).toEqual({
        start: '2027-03-01',
        nextReset: '2027-04-01',
      })
      expect(
        quotaWindow(
          'monthly',
          at('2027-02-15'),
          settings({ monthlyResetDay: 15 }),
        ),
      ).toEqual({ start: '2027-02-15', nextReset: '2027-03-15' })
    })

    it.each([
      [15, '2027-02-14', '2027-01-15', '2027-02-15'],
      [15, '2027-01-10', '2026-12-15', '2027-01-15'],
    ])('D=%i on %s spans %s to %s', (day, today, start, nextReset) => {
      for (const monthEnd of [
        'last-day',
        'skip-month',
        'next-month',
      ] as const) {
        expect(
          quotaWindow(
            'monthly',
            at(today),
            settings({ monthlyResetDay: day, monthEnd }),
          ),
        ).toEqual({ start, nextReset })
      }
    })

    it.each([
      [31, 'last-day', '2027-04-15', '2027-03-31', '2027-04-30'],
      [31, 'skip-month', '2027-04-15', '2027-03-31', '2027-05-31'],
      [31, 'next-month', '2027-04-15', '2027-03-31', '2027-05-01'],
      [31, 'last-day', '2027-02-15', '2027-01-31', '2027-02-28'],
      [31, 'skip-month', '2027-02-15', '2027-01-31', '2027-03-31'],
      [31, 'next-month', '2027-02-15', '2027-01-31', '2027-03-01'],
      [31, 'last-day', '2028-02-29', '2028-02-29', '2028-03-31'],
      [31, 'skip-month', '2028-02-29', '2028-01-31', '2028-03-31'],
      [31, 'next-month', '2028-02-29', '2028-01-31', '2028-03-01'],
      [31, 'last-day', '2027-01-15', '2026-12-31', '2027-01-31'],
      [31, 'skip-month', '2027-01-15', '2026-12-31', '2027-01-31'],
      [31, 'next-month', '2027-01-15', '2026-12-31', '2027-01-31'],
      [30, 'last-day', '2027-02-15', '2027-01-30', '2027-02-28'],
      [30, 'skip-month', '2027-02-15', '2027-01-30', '2027-03-30'],
      [30, 'next-month', '2027-02-15', '2027-01-30', '2027-03-01'],
      [30, 'last-day', '2028-02-15', '2028-01-30', '2028-02-29'],
      [30, 'skip-month', '2028-02-15', '2028-01-30', '2028-03-30'],
      [30, 'next-month', '2028-02-15', '2028-01-30', '2028-03-01'],
      [30, 'skip-month', '2027-04-15', '2027-03-30', '2027-04-30'],
      [29, 'last-day', '2027-02-15', '2027-01-29', '2027-02-28'],
      [29, 'skip-month', '2027-02-15', '2027-01-29', '2027-03-29'],
      [29, 'next-month', '2027-02-15', '2027-01-29', '2027-03-01'],
      [29, 'last-day', '2028-02-15', '2028-01-29', '2028-02-29'],
      [29, 'skip-month', '2028-02-15', '2028-01-29', '2028-02-29'],
      [29, 'next-month', '2028-02-15', '2028-01-29', '2028-02-29'],
      [29, 'last-day', '2027-03-01', '2027-02-28', '2027-03-29'],
      [29, 'skip-month', '2027-03-01', '2027-01-29', '2027-03-29'],
      [29, 'next-month', '2027-03-01', '2027-03-01', '2027-03-29'],
      [1, 'skip-month', '2026-12-31', '2026-12-01', '2027-01-01'],
    ] as const)(
      'D=%i %s on %s spans %s to %s',
      (day, monthEnd, today, start, nextReset) => {
        expect(
          quotaWindow(
            'monthly',
            at(today),
            settings({ monthlyResetDay: day, monthEnd }),
          ),
        ).toEqual({ start, nextReset })
      },
    )
  })

  describe('quotaResetDate', () => {
    it('uses the shared next reset for daily and monthly', () => {
      const window = quotaWindow('monthly', at('2027-02-15'), settings())
      expect(quotaResetDate('monthly', window, null, settings())).toBe(
        new Date(2027, 2, 1).toISOString(),
      )
    })

    it('resets weekly rolling when the earliest counted request ages out', () => {
      const weekly = settings({ weeklyRollingDays: 7 })
      const window = quotaWindow('weekly_rolling', at('2027-11-10'), weekly)
      expect(
        quotaResetDate('weekly_rolling', window, '2027-11-05', weekly),
      ).toBe(new Date(2027, 10, 12).toISOString())
    })

    it('has no weekly rolling reset without usage', () => {
      const window = quotaWindow('weekly_rolling', at('2027-11-10'), settings())
      expect(quotaResetDate('weekly_rolling', window, null, settings())).toBe(
        null,
      )
    })
  })

  describe('longestQuotaWindowDays', () => {
    it.each([
      [settings(), 31],
      [settings({ weeklyRollingDays: 45 }), 45],
      [settings({ monthlyResetDay: 29, monthEnd: 'skip-month' }), 62],
      [settings({ monthlyResetDay: 28, monthEnd: 'skip-month' }), 31],
      [settings({ monthlyResetDay: 31, monthEnd: 'last-day' }), 31],
      [settings({ monthlyResetDay: 31, monthEnd: 'next-month' }), 31],
      [
        settings({
          weeklyRollingDays: 90,
          monthlyResetDay: 31,
          monthEnd: 'skip-month',
        }),
        90,
      ],
    ])('%o needs %i days', (value, days) => {
      expect(longestQuotaWindowDays(value)).toBe(days)
    })
  })
})
