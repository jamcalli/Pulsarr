/** Every formatter reads this, so the future language setting changes all of them in one place. */
let locale: string | undefined

export function setFormatLocale(next: string | undefined): void {
  locale = next
}

export function formatTime(value: Date | number): string {
  return new Intl.DateTimeFormat(locale, { timeStyle: 'medium' }).format(value)
}

export function formatDate(value: Date | number): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(value)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(locale).format(value)
}

/** Pass `plural` when it is not `singular` plus "s". */
export function formatCount(
  value: number,
  singular: string,
  plural = `${singular}s`,
): string {
  const rule = new Intl.PluralRules(locale).select(value)
  return `${formatNumber(value)} ${rule === 'one' ? singular : plural}`
}
