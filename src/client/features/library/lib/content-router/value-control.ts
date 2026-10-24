import { z } from 'zod'
import type {
  ConditionOperator,
  OperatorInfo,
} from '@/features/library/lib/content-router/condition-fields'
import type { OptionSource } from '@/features/library/lib/content-router/condition-options'
import type { DraftValue } from '@/features/library/lib/content-router/condition-tree'

export type ValueControl =
  | { kind: 'chips'; numeric: boolean; source: OptionSource | null }
  | { kind: 'range' }
  | { kind: 'number' }
  | { kind: 'select'; numeric: boolean; source: OptionSource }
  | { kind: 'text'; regex: boolean }

interface OptionField {
  source: OptionSource
  /** Single-value operators that pick from the list, the rest of the string operators stay free text. */
  selectOperators: readonly ConditionOperator[]
}

const OPTION_FIELDS: Record<string, OptionField> = {
  genres: { source: 'genres', selectOperators: ['contains', 'notContains'] },
  certification: {
    source: 'certifications',
    selectOperators: ['equals', 'notEquals'],
  },
  movieStatus: {
    source: 'movieStatuses',
    selectOperators: ['equals', 'notEquals'],
  },
  seriesStatus: {
    source: 'seriesStatuses',
    selectOperators: ['equals', 'notEquals'],
  },
  user: { source: 'users', selectOperators: ['equals', 'notEquals'] },
  streamingServices: { source: 'streamingServices', selectOperators: [] },
}

const TEXT: ValueControl = { kind: 'text', regex: false }

export function valueControlFor(
  field: string,
  operator: OperatorInfo | undefined,
): ValueControl {
  if (!operator) return TEXT
  if (operator.name === 'regex') return { kind: 'text', regex: true }
  if (operator.name === 'between') return { kind: 'range' }

  const types = operator.valueTypes
  const numeric = types.includes('number') || types.includes('number[]')
  const optionField = OPTION_FIELDS[field]

  if (types.includes('string[]') || types.includes('number[]')) {
    return { kind: 'chips', numeric, source: optionField?.source ?? null }
  }
  if (types.includes('number') && !types.includes('string')) {
    return { kind: 'number' }
  }
  if (
    optionField?.selectOperators.some((name) => name === operator.name) === true
  ) {
    return { kind: 'select', numeric, source: optionField.source }
  }
  return TEXT
}

/** A numeric control stores numbers, so a string that parses as one goes back as a number. */
export function storedScalar(value: string, numeric: boolean): string | number {
  if (!numeric || value.trim() === '') return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : value
}

export function optionSourceFor(field: string): OptionSource | null {
  return OPTION_FIELDS[field]?.source ?? null
}

const NUMBER_INPUT = /^-?\d+(\.\d+)?$/

export function chipInputSchema(numeric: boolean) {
  const text = z.string().trim().min(1, { error: 'Enter a value.' })
  return numeric ? text.regex(NUMBER_INPUT, { error: 'Enter a number.' }) : text
}

export function valueFits(value: DraftValue, control: ValueControl): boolean {
  switch (control.kind) {
    case 'chips':
      return Array.isArray(value)
    case 'range':
      return (
        typeof value === 'object' && value !== null && !Array.isArray(value)
      )
    case 'number':
      return value === undefined || typeof value === 'number'
    case 'select':
    case 'text':
      return typeof value === 'string'
  }
}
