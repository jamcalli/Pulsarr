export interface NumericRange {
  min?: number
  max?: number
}

export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function isNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item))
  )
}

export function isNumericRange(value: unknown): value is NumericRange {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  const hasMin = 'min' in obj
  const hasMax = 'max' in obj
  if (!hasMin && !hasMax) return false
  const hasUsableBound =
    (hasMin && obj.min !== undefined) || (hasMax && obj.max !== undefined)
  if (!hasUsableBound) return false
  const minOk =
    !hasMin ||
    obj.min === undefined ||
    (typeof obj.min === 'number' && Number.isFinite(obj.min))
  const maxOk =
    !hasMax ||
    obj.max === undefined ||
    (typeof obj.max === 'number' && Number.isFinite(obj.max))
  return minOk && maxOk
}
