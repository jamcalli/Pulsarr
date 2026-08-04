import { useCallback, useState } from 'react'

/**
 * A persisted UI preference: a storage key, a typed fallback, and a
 * validating parser so corrupt or stale localStorage values fall back to
 * the default instead of leaking into state.
 */
export interface PrefDef<T> {
  key: string
  fallback: T
  parse: (raw: string) => T | undefined
  serialize: (value: T) => string
}

export function readPref<T>(def: PrefDef<T>): T {
  try {
    const raw = localStorage.getItem(def.key)
    if (raw === null) return def.fallback
    const parsed = def.parse(raw)
    return parsed === undefined ? def.fallback : parsed
  } catch {
    return def.fallback
  }
}

/**
 * Best-effort write: storage failures (private browsing, quota) are
 * swallowed so state updates still apply.
 */
export function writePref<T>(def: PrefDef<T>, value: T): void {
  try {
    localStorage.setItem(def.key, def.serialize(value))
  } catch {
    // Storage unavailable - callers keep their in-memory state regardless
  }
}

/**
 * State backed by a persisted preference with write-through on set.
 * Dynamic-key defs must be memoized by the caller so the setter stays
 * stable.
 */
export function usePref<T>(def: PrefDef<T>): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => readPref(def))

  const set = useCallback(
    (next: T) => {
      writePref(def, next)
      setValue(next)
    },
    [def],
  )

  return [value, set]
}

export function parseBoolean(raw: string): boolean | undefined {
  if (raw === 'true') return true
  if (raw === 'false') return false
  return undefined
}

export function parseOneOf<const T extends readonly string[]>(values: T) {
  return (raw: string): T[number] | undefined =>
    values.includes(raw) ? (raw as T[number]) : undefined
}

export function parseIntInRange(min: number, max: number) {
  return (raw: string): number | undefined => {
    const parsed = Number(raw)
    return Number.isInteger(parsed) && parsed >= min && parsed <= max
      ? parsed
      : undefined
  }
}

export function parseBooleanRecord(
  raw: string,
): Record<string, boolean> | undefined {
  try {
    const parsed = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return undefined
    }
    const record: Record<string, boolean> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== 'boolean') return undefined
      record[key] = value
    }
    return record
  } catch {
    return undefined
  }
}
