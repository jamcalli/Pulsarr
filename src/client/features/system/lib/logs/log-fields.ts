import type { LogValue } from '@root/types/logs.types'
import { formatList } from '@/lib/format'

export interface LogField {
  key: string
  value: string
}

export interface LogFieldGroups {
  fields: LogField[]
  /** Multi-line values such as stacks, and objects nested past the first level. */
  blocks: LogField[]
}

type LogObject = { [key: string]: LogValue }

function isFilledObject(value: LogValue): value is LogObject {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  )
}

function inlineValue(value: LogValue): string {
  if (typeof value !== 'object' || value === null) return String(value)
  if (Array.isArray(value) && value.every((item) => typeof item !== 'object')) {
    return formatList(value.map(String))
  }
  return JSON.stringify(value)
}

/** Flattens one level into dotted keys, strings unquoted and numbers as logged. */
export function flattenLogData(data: LogObject): LogFieldGroups {
  const groups: LogFieldGroups = { fields: [], blocks: [] }
  const push = (key: string, value: LogValue) => {
    if (typeof value === 'string' && value.includes('\n')) {
      groups.blocks.push({ key, value })
    } else if (isFilledObject(value)) {
      groups.blocks.push({ key, value: JSON.stringify(value, null, 2) })
    } else {
      groups.fields.push({ key, value: inlineValue(value) })
    }
  }
  for (const [key, value] of Object.entries(data)) {
    if (isFilledObject(value)) {
      for (const [inner, innerValue] of Object.entries(value)) {
        push(`${key}.${inner}`, innerValue)
      }
    } else {
      push(key, value)
    }
  }
  return groups
}
