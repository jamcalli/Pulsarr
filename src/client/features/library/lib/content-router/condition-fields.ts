import { compareText } from '@/lib/format'
import type { components } from '@/types/api.js'

type EvaluatorMetadata = components['schemas']['EvaluatorMetadata']
export type OperatorInfo =
  EvaluatorMetadata['supportedOperators'][string][number]
export type ConditionOperator = components['schemas']['ConditionOperator']
export type RouteType = components['schemas']['InstanceType']

export interface ConditionField {
  name: string
  label: string
  description: string
  operators: OperatorInfo[]
}

const FIELD_LABELS: Record<string, string> = {
  certification: 'Certification',
  genres: 'Genres',
  imdbRating: 'IMDb rating',
  language: 'Language',
  movieStatus: 'Movie status',
  plexList: 'Plex list',
  rtAudienceRating: 'RT audience score',
  rtCriticRating: 'RT critic score',
  season: 'Season',
  seriesStatus: 'Series status',
  streamingServices: 'Streaming services',
  tmdbRating: 'TMDB rating',
  user: 'User',
  year: 'Year',
}

/** Falls back to the field name split into words for a field this list does not know. */
export function fieldLabel(name: string): string {
  const known = FIELD_LABELS[name]
  if (known) return known
  const words = name.replace(/([A-Z])/g, ' $1').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  equals: 'is',
  notEquals: 'is not',
  contains: 'contains',
  notContains: 'does not contain',
  in: 'is any of',
  notIn: 'is none of',
  greaterThan: 'is above',
  lessThan: 'is below',
  between: 'is between',
  regex: 'matches regex',
}

export function isConditionOperator(value: string): value is ConditionOperator {
  return value in OPERATOR_LABELS
}

interface NumberRange {
  min: number
  max: number
  step: number
  grouping: boolean
}

const NUMBER_RANGES: Record<string, NumberRange> = {
  year: { min: 1900, max: 2100, step: 1, grouping: false },
  imdbRating: { min: 0, max: 10, step: 0.1, grouping: true },
  tmdbRating: { min: 0, max: 10, step: 0.1, grouping: true },
  rtCriticRating: { min: 0, max: 100, step: 1, grouping: true },
  rtAudienceRating: { min: 0, max: 100, step: 1, grouping: true },
}

const DEFAULT_NUMBER_RANGE: NumberRange = {
  min: 0,
  max: 1_000_000,
  step: 1,
  grouping: true,
}

export function numberRange(field: string): NumberRange {
  return NUMBER_RANGES[field] ?? DEFAULT_NUMBER_RANGE
}

const UNIT_SYMBOLS: Record<string, string> = {
  imdbRating: '/10',
  tmdbRating: '/10',
  rtCriticRating: '%',
  rtAudienceRating: '%',
}

export function unitSymbol(field: string): string | undefined {
  return UNIT_SYMBOLS[field]
}

export const VOTE_FIELDS: ReadonlySet<string> = new Set(['imdbRating'])

export const MINIMUM_VOTES = { min: 0, max: 10_000_000 } as const

const CONDITIONAL_EVALUATOR = 'Conditional Router'

export function conditionFields(
  evaluators: readonly EvaluatorMetadata[],
  type: RouteType,
): ConditionField[] {
  const byName = new Map<string, ConditionField>()
  for (const evaluator of evaluators) {
    if (evaluator.name === CONDITIONAL_EVALUATOR) continue
    if (
      evaluator.contentType &&
      evaluator.contentType !== 'both' &&
      evaluator.contentType !== type
    ) {
      continue
    }
    for (const field of evaluator.supportedFields) {
      byName.set(field.name, {
        name: field.name,
        label: fieldLabel(field.name),
        description: field.description,
        operators: evaluator.supportedOperators[field.name] ?? [],
      })
    }
  }
  return [...byName.values()].sort((a, b) => compareText(a.label, b.label))
}
