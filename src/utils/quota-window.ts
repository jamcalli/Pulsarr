import type { QuotaType } from '@root/types/approval.types.js'
import type { Config } from '@root/types/config.types.js'

export interface QuotaWindowSettings {
  weeklyRollingDays: number
  monthlyResetDay: number
  monthEnd: 'last-day' | 'skip-month' | 'next-month'
}

/** Local YYYY-MM-DD dates. A null nextReset means the reset is per user (weekly rolling). */
export interface QuotaWindow {
  start: string
  nextReset: string | null
}

export function resolveQuotaWindowSettings(
  quotaSettings: Config['quotaSettings'],
): QuotaWindowSettings {
  return {
    weeklyRollingDays: quotaSettings?.weeklyRolling?.resetDays ?? 7,
    monthlyResetDay: quotaSettings?.monthly?.resetDay ?? 1,
    monthEnd: quotaSettings?.monthly?.handleMonthEnd ?? 'last-day',
  }
}

export function toLocalDateString(date: Date): string {
  return date.toLocaleDateString('sv-SE')
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function parseLocalDate(date: string): Date {
  return new Date(`${date}T00:00:00`)
}

function monthlyResetIn(
  year: number,
  month: number,
  settings: QuotaWindowSettings,
): Date | null {
  const lastDay = new Date(year, month + 1, 0).getDate()
  if (settings.monthlyResetDay <= lastDay) {
    return new Date(year, month, settings.monthlyResetDay)
  }
  switch (settings.monthEnd) {
    case 'last-day':
      return new Date(year, month, lastDay)
    case 'skip-month':
      return null
    case 'next-month':
      return new Date(year, month + 1, 1)
  }
}

function findMonthlyReset(
  today: Date,
  settings: QuotaWindowSettings,
  direction: 1 | -1,
  accept: (reset: Date) => boolean,
): Date {
  for (let offset = 0; ; offset += direction) {
    const reset = monthlyResetIn(
      today.getFullYear(),
      today.getMonth() + offset,
      settings,
    )
    if (reset && accept(reset)) return reset
  }
}

function monthlyWindow(
  today: Date,
  settings: QuotaWindowSettings,
): QuotaWindow {
  const start = findMonthlyReset(today, settings, -1, (reset) => reset <= today)
  const nextReset = findMonthlyReset(
    today,
    settings,
    1,
    (reset) => reset > today,
  )
  return {
    start: toLocalDateString(start),
    nextReset: toLocalDateString(nextReset),
  }
}

export function quotaWindow(
  type: QuotaType,
  today: Date,
  settings: QuotaWindowSettings,
): QuotaWindow {
  const day = startOfDay(today)
  switch (type) {
    case 'daily':
      return {
        start: toLocalDateString(day),
        nextReset: toLocalDateString(addDays(day, 1)),
      }
    case 'weekly_rolling':
      return {
        start: toLocalDateString(addDays(day, 1 - settings.weeklyRollingDays)),
        nextReset: null,
      }
    case 'monthly':
      return monthlyWindow(day, settings)
  }
}

/** Reset instant as an ISO string. Weekly rolling resets when the earliest counted request leaves the window. */
export function quotaResetDate(
  type: QuotaType,
  window: QuotaWindow,
  earliestUsage: string | null,
  settings: QuotaWindowSettings,
): string | null {
  if (type !== 'weekly_rolling') {
    return window.nextReset
      ? parseLocalDate(window.nextReset).toISOString()
      : null
  }
  return earliestUsage
    ? addDays(
        parseLocalDate(earliestUsage),
        settings.weeklyRollingDays,
      ).toISOString()
    : null
}

export function longestQuotaWindowDays(settings: QuotaWindowSettings): number {
  const longestMonth =
    settings.monthEnd === 'skip-month' && settings.monthlyResetDay >= 29
      ? 62
      : 31
  return Math.max(settings.weeklyRollingDays, longestMonth)
}
