/** Every formatter reads this, so the future language setting changes all of them in one place. */
let locale: string | undefined

export function setFormatLocale(next: string | undefined): void {
  locale = next
}

export function formatLocale(): string | undefined {
  return locale
}

export function formatTime(value: Date | number): string {
  return new Intl.DateTimeFormat(locale, { timeStyle: 'medium' }).format(value)
}

/** Weekday name for a cron day of the week, 0 is Sunday. */
export function formatWeekday(day: number): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(
    new Date(2026, 0, 4 + day),
  )
}

/** The clock time at the start of an hour of the day, 0 to 23. */
export function formatHour(hour: number): string {
  return new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(
    new Date(2026, 0, 1, hour),
  )
}

export function formatDate(value: Date | number): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(value)
}

/** `fractionDigits` fixes the decimals shown, otherwise the locale default applies. */
export function formatNumber(value: number, fractionDigits?: number): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

export function formatUngrouped(value: number): string {
  return new Intl.NumberFormat(locale, { useGrouping: false }).format(value)
}

export function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

/** Falls back to the upper-cased code when the runtime cannot name it. */
export function formatLanguage(code: string): string {
  try {
    return (
      new Intl.DisplayNames(locale, { type: 'language' }).of(code) ??
      code.toUpperCase()
    )
  } catch {
    return code.toUpperCase()
  }
}

export function formatDateTime(value: Date | number): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(value)
}

export function compareText(a: string, b: string): number {
  return new Intl.Collator(locale).compare(a, b)
}

/** A plain list of names or values, without "and" before the last one. */
export function formatList(items: readonly string[]): string {
  return new Intl.ListFormat(locale, { style: 'short', type: 'unit' }).format(
    items,
  )
}

export function formatYear(value: Date | number): string {
  return new Intl.DateTimeFormat(locale, { year: 'numeric' }).format(value)
}

/** Hours and minutes from a length in minutes, hours left out under one hour. */
export function formatRuntime(minutes: number): string {
  const unit = (value: number, name: 'hour' | 'minute') =>
    new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: name,
      unitDisplay: 'short',
    }).format(value)
  const total = Math.round(minutes)
  const hours = Math.floor(total / 60)
  const rest = total % 60
  if (hours === 0) return unit(rest, 'minute')
  if (rest === 0) return unit(hours, 'hour')
  return `${unit(hours, 'hour')} ${unit(rest, 'minute')}`
}

/** Pass `plural` when it is not `singular` plus "s". */
export function pluralize(
  value: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return new Intl.PluralRules(locale).select(value) === 'one'
    ? singular
    : plural
}

/** Pass `plural` when it is not `singular` plus "s". */
export function formatCount(
  value: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${formatNumber(value)} ${pluralize(value, singular, plural)}`
}

const ORDINAL_SUFFIXES: Record<Intl.LDMLPluralRule, string> = {
  zero: 'th',
  one: 'st',
  two: 'nd',
  few: 'rd',
  many: 'th',
  other: 'th',
}

/** English ordinal like "15th", so it takes English plural rules whatever the locale. */
export function formatOrdinal(value: number): string {
  const rule = new Intl.PluralRules('en', { type: 'ordinal' }).select(value)
  return `${formatNumber(value)}${ORDINAL_SUFFIXES[rule]}`
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['week', 7 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
]

export function formatRelative(
  value: Date | number,
  now: number = Date.now(),
): string {
  const seconds = (new Date(value).getTime() - now) / 1000
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (Math.abs(seconds) < 45) return relative.format(0, 'second')
  const [unit, size] = RELATIVE_UNITS.find(
    ([, size]) => Math.abs(seconds) >= size,
  ) ?? ['minute', 60]
  return relative.format(Math.round(seconds / size), unit)
}

export function formatPercent(ratio: number, digits = 0): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: digits,
  }).format(ratio)
}
