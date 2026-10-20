const pluralRules = new Intl.PluralRules('en-US')

/** Pass `plural` when it is not `singular` plus "s". */
export function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return pluralRules.select(count) === 'one' ? singular : plural
}
