import {
  type ConditionOperator,
  conditionFields,
  type RouteType,
} from '@/features/library/lib/content-router/condition-fields'
import {
  blankCondition,
  emptyDraftValue,
} from '@/features/library/lib/content-router/condition-tree'
import type {
  ControlResolver,
  NumericResolver,
} from '@/features/library/lib/content-router/route-form'
import { valueControlFor } from '@/features/library/lib/content-router/value-control'
import type { components } from '@/types/api.js'

type EvaluatorMetadata = components['schemas']['EvaluatorMetadata']

function op(
  name: ConditionOperator,
  valueTypes: components['schemas']['ConditionValueType'][],
) {
  return { name, description: name, valueTypes }
}

export const evaluators: EvaluatorMetadata[] = [
  {
    name: 'Genre Router',
    description: 'Routes by genre',
    priority: 10,
    contentType: 'both',
    supportedFields: [
      { name: 'genres', description: 'Genres', valueTypes: ['string[]'] },
    ],
    supportedOperators: {
      genres: [
        op('in', ['string[]']),
        op('notIn', ['string[]']),
        op('contains', ['string']),
        op('regex', ['string']),
      ],
    },
  },
  {
    name: 'Year Router',
    description: 'Routes by year',
    priority: 10,
    contentType: 'both',
    supportedFields: [
      {
        name: 'year',
        description: 'Year',
        valueTypes: ['number', 'number[]', 'object'],
      },
    ],
    supportedOperators: {
      year: [
        op('between', ['object']),
        op('greaterThan', ['number']),
        op('in', ['number[]']),
      ],
    },
  },
  {
    name: 'Ratings Router',
    description: 'Routes by rating',
    priority: 10,
    contentType: 'both',
    supportedFields: [
      {
        name: 'imdbRating',
        description: 'IMDb',
        valueTypes: ['number', 'number[]', 'object'],
      },
      {
        name: 'rtCriticRating',
        description: 'RT critic',
        valueTypes: ['number', 'number[]', 'object'],
      },
    ],
    supportedOperators: {
      imdbRating: [
        op('greaterThan', ['number']),
        op('between', ['object']),
        op('in', ['number[]']),
      ],
      rtCriticRating: [op('greaterThan', ['number'])],
    },
  },
  {
    name: 'User Router',
    description: 'Routes by user',
    priority: 10,
    contentType: 'both',
    supportedFields: [
      {
        name: 'user',
        description: 'User',
        valueTypes: ['string', 'number', 'string[]', 'number[]'],
      },
    ],
    supportedOperators: {
      user: [
        op('in', ['string[]', 'number[]']),
        op('notIn', ['string[]', 'number[]']),
        op('equals', ['string', 'number']),
        op('notEquals', ['string', 'number']),
      ],
    },
  },
  {
    name: 'Streaming Services Router',
    description: 'Routes by provider',
    priority: 10,
    contentType: 'both',
    supportedFields: [
      {
        name: 'streamingServices',
        description: 'Providers',
        valueTypes: ['number[]', 'number'],
      },
    ],
    supportedOperators: {
      streamingServices: [op('in', ['number[]', 'number'])],
    },
  },
  {
    name: 'Certification Router',
    description: 'Routes by certification',
    priority: 10,
    contentType: 'both',
    supportedFields: [
      {
        name: 'certification',
        description: 'Certification',
        valueTypes: ['string', 'string[]'],
      },
    ],
    supportedOperators: {
      certification: [op('equals', ['string']), op('in', ['string[]'])],
    },
  },
  {
    name: 'Season Router',
    description: 'Routes by season',
    priority: 10,
    contentType: 'sonarr',
    supportedFields: [
      { name: 'season', description: 'Season', valueTypes: ['number'] },
    ],
    supportedOperators: { season: [op('equals', ['number'])] },
  },
  {
    name: 'Conditional Router',
    description: 'Nested conditions',
    priority: 100,
    contentType: 'both',
    supportedFields: [
      { name: 'condition', description: 'Condition', valueTypes: ['object'] },
    ],
    supportedOperators: { condition: [op('equals', ['object'])] },
  },
]

export function resolvers(type: RouteType = 'radarr') {
  const fields = conditionFields(evaluators, type)
  const controlFor: ControlResolver = (field, operator) => {
    const known = fields.find((candidate) => candidate.name === field)
    if (!known) return null
    return valueControlFor(
      field,
      known.operators.find((candidate) => candidate.name === operator),
    )
  }
  const numeric: NumericResolver = (field, operator) => {
    const control = controlFor(field, operator)
    return (
      (control?.kind === 'chips' || control?.kind === 'select') &&
      control.numeric
    )
  }
  const emptyValue = (field: string, operator: ConditionOperator) =>
    emptyDraftValue(controlFor(field, operator)?.kind ?? 'text')
  return {
    fields,
    controlFor,
    numeric,
    blank: (parentId: string) => blankCondition(parentId, fields, emptyValue),
  }
}
