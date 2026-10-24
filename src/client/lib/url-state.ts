export type SortDirection = 'asc' | 'desc'

export const SORT_DIRECTIONS: readonly SortDirection[] = ['asc', 'desc']

export function oneOf<T extends string>(
  value: string | null,
  allowed: readonly T[],
): T | null {
  return allowed.find((option) => option === value) ?? null
}

export function positiveInt(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return parsed >= 1 ? parsed : null
}
