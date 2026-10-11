import {
  type ComparisonOperator,
  ComparisonOperatorSchema,
} from '@root/schemas/content-router/content-router.schema.js'
import type { EvaluatorMetadata } from '@root/schemas/content-router/evaluator-metadata.schema.js'

export const ROUTER_FIELD_NAMES = [
  'year',
  'season',
  'genres',
  'certification',
  'language',
  'imdbRating',
  'imdbVotes',
  'rtCriticRating',
  'rtAudienceRating',
  'tmdbRating',
  'movieStatus',
  'seriesStatus',
  'streamingServices',
  'plexList',
  'user',
] as const
export type RouterField = (typeof ROUTER_FIELD_NAMES)[number]

export const ROUTER_VALUE_KINDS = [
  'number',
  'text',
  'textSet',
  'enum',
  'identity',
] as const
export type RouterValueKind = (typeof ROUTER_VALUE_KINDS)[number]

export const CONDITION_VALUE_TYPES = [
  'number',
  'number[]',
  'string',
  'string[]',
  'object',
] as const
export type ConditionValueType = (typeof CONDITION_VALUE_TYPES)[number]

export const ROUTER_EVALUATOR_NAMES = [
  'Conditional Router',
  'Streaming Availability Router',
  'Ratings Router',
  'Genre Router',
  'User Router',
  'Year Router',
  'Season Router',
  'Language Router',
  'Certification Router',
  'Series Status Router',
  'Movie Status Router',
  'Plex List Router',
] as const
export type RouterEvaluatorName = (typeof ROUTER_EVALUATOR_NAMES)[number]

export type RouterOptionSource =
  | 'genres'
  | 'certifications'
  | 'movieStatuses'
  | 'seriesStatuses'
  | 'users'
  | 'streamingServices'

export type RouterContentType = 'radarr' | 'sonarr' | 'both'

export interface OperatorSpec {
  description: string
  valueTypes?: readonly ConditionValueType[]
  valueFormat?: string
}

export interface FieldControl {
  min?: number
  max?: number
  step?: number
  grouping?: boolean
  unit?: string
  options?: {
    source: RouterOptionSource
    selectOperators: readonly ComparisonOperator[]
  }
  votes?: { min: number; max: number }
}

export interface FieldSpec<K extends RouterValueKind = RouterValueKind> {
  label: string
  description: string
  kind: K
  evaluator: RouterEvaluatorName
  appliesTo: RouterContentType
  /** Insertion order is the order the metadata route advertises. */
  operators: Partial<Record<ComparisonOperator, OperatorSpec>>
  valueTypes?: readonly ConditionValueType[]
  /** Evaluable and accepted on save, but left out of the metadata route. */
  hidden?: true
  control?: FieldControl
}

/** Default value types per kind, a field or operator overrides only where its metadata differs. */
export const KIND_VALUE_TYPES: {
  [K in RouterValueKind]: {
    field: readonly ConditionValueType[]
    operators: Partial<
      Record<ComparisonOperator, readonly ConditionValueType[]>
    >
  }
} = {
  number: {
    field: ['number', 'number[]', 'object'],
    operators: {
      equals: ['number'],
      notEquals: ['number'],
      greaterThan: ['number'],
      lessThan: ['number'],
      in: ['number[]'],
      notIn: ['number[]'],
      between: ['object'],
    },
  },
  text: {
    field: ['string', 'string[]'],
    operators: {
      equals: ['string'],
      notEquals: ['string'],
      contains: ['string'],
      notContains: ['string'],
      in: ['string[]'],
      notIn: ['string[]'],
      regex: ['string'],
    },
  },
  enum: {
    field: ['string', 'string[]'],
    operators: {
      equals: ['string'],
      notEquals: ['string'],
      in: ['string[]'],
      notIn: ['string[]'],
    },
  },
  textSet: {
    field: ['string', 'string[]'],
    operators: {
      contains: ['string'],
      notContains: ['string'],
      in: ['string[]'],
      notIn: ['string[]'],
      equals: ['string', 'string[]'],
      regex: ['string'],
    },
  },
  identity: {
    field: ['string', 'number', 'string[]', 'number[]'],
    operators: {
      equals: ['string', 'number'],
      notEquals: ['string', 'number'],
      in: ['string[]', 'number[]'],
      notIn: ['string[]', 'number[]'],
      regex: ['string'],
    },
  },
}

export const ROUTER_EVALUATORS: ReadonlyArray<{
  name: RouterEvaluatorName
  description: string
  priority: number
  contentType: RouterContentType
}> = [
  {
    name: 'Conditional Router',
    description: 'Routes content based on complex conditional rules',
    priority: 100,
    contentType: 'both',
  },
  {
    name: 'Streaming Availability Router',
    description:
      'Routes content based on streaming service availability to prevent redundant downloads',
    priority: 85,
    contentType: 'both',
  },
  {
    name: 'Ratings Router',
    description:
      'Routes content based on ratings (IMDB, Rotten Tomatoes, TMDB)',
    priority: 80,
    contentType: 'both',
  },
  {
    name: 'Genre Router',
    description: 'Routes content based on genre matching rules',
    priority: 80,
    contentType: 'both',
  },
  {
    name: 'User Router',
    description: 'Routes content based on requesting users',
    priority: 75,
    contentType: 'both',
  },
  {
    name: 'Year Router',
    description: 'Routes content based on release year',
    priority: 70,
    contentType: 'both',
  },
  {
    name: 'Season Router',
    description: 'Routes TV shows based on season numbers',
    priority: 68,
    contentType: 'sonarr',
  },
  {
    name: 'Language Router',
    description: 'Routes content based on original language',
    priority: 65,
    contentType: 'both',
  },
  {
    name: 'Certification Router',
    description: 'Routes content based on certification/rating',
    priority: 60,
    contentType: 'both',
  },
  {
    name: 'Series Status Router',
    description: 'Routes TV shows based on series status from Sonarr',
    priority: 55,
    contentType: 'sonarr',
  },
  {
    name: 'Movie Status Router',
    description: 'Routes movies based on movie status from Radarr',
    priority: 55,
    contentType: 'radarr',
  },
  {
    name: 'Plex List Router',
    description: 'Routes content based on Plex custom list membership',
    priority: 50,
    contentType: 'both',
  },
]

const RATING_OPERATORS = {
  equals: { description: 'Rating matches exactly' },
  notEquals: { description: 'Rating does not match' },
  greaterThan: { description: 'Rating is greater than value' },
  lessThan: { description: 'Rating is less than value' },
  in: {
    description: 'Rating is one of the provided values',
    valueFormat: 'Array of ratings, e.g. [8.0, 8.5, 9.0]',
  },
  notIn: {
    description: 'Rating is not any of the provided values',
    valueFormat: 'Array of ratings, e.g. [8.0, 8.5, 9.0]',
  },
  between: {
    description: 'Rating is within a range (inclusive)',
    valueFormat:
      'Object with min and/or max properties, e.g. { min: 7.0, max: 9.0 }',
  },
} as const satisfies FieldSpec['operators']

const HUNDRED_SCALE_CONTROL = {
  min: 0,
  max: 100,
  step: 1,
  grouping: true,
  unit: '%',
} as const satisfies FieldControl

const TEN_SCALE_CONTROL = {
  min: 0,
  max: 10,
  step: 0.1,
  grouping: true,
  unit: '/10',
} as const satisfies FieldControl

const EQUALITY_SELECT = ['equals', 'notEquals'] as const

export const ROUTER_FIELDS = {
  streamingServices: {
    label: 'Streaming services',
    description:
      'TMDB provider IDs for streaming services (e.g., [8, 337] for Netflix, Disney+)',
    kind: 'number',
    evaluator: 'Streaming Availability Router',
    appliesTo: 'both',
    valueTypes: ['number[]', 'number'],
    operators: {
      in: {
        description:
          'Content is available on at least one of these streaming services',
        valueTypes: ['number[]', 'number'],
        valueFormat:
          'Single provider ID or array of TMDB provider IDs, e.g., 8 or [8, 337] for Netflix, Disney+',
      },
      notIn: {
        description:
          'Content is not available on any of these streaming services',
        valueTypes: ['number[]', 'number'],
        valueFormat:
          'Single provider ID or array of TMDB provider IDs, e.g., 8 or [8, 15, 384] for Netflix, Hulu, HBO Max',
      },
    },
    control: {
      options: { source: 'streamingServices', selectOperators: [] },
    },
  },
  imdbRating: {
    label: 'IMDb rating',
    description: 'IMDB rating (0-10 scale, with optional vote count filter)',
    kind: 'number',
    evaluator: 'Ratings Router',
    appliesTo: 'both',
    operators: RATING_OPERATORS,
    control: { ...TEN_SCALE_CONTROL, votes: { min: 0, max: 10_000_000 } },
  },
  imdbVotes: {
    label: 'IMDb votes',
    description: 'IMDb vote count',
    kind: 'number',
    evaluator: 'Ratings Router',
    appliesTo: 'both',
    operators: RATING_OPERATORS,
    hidden: true,
  },
  rtCriticRating: {
    label: 'RT critic score',
    description: 'Rotten Tomatoes critic score (0-100%)',
    kind: 'number',
    evaluator: 'Ratings Router',
    appliesTo: 'both',
    operators: RATING_OPERATORS,
    control: HUNDRED_SCALE_CONTROL,
  },
  rtAudienceRating: {
    label: 'RT audience score',
    description: 'Rotten Tomatoes audience score (0-100%)',
    kind: 'number',
    evaluator: 'Ratings Router',
    appliesTo: 'both',
    operators: RATING_OPERATORS,
    control: HUNDRED_SCALE_CONTROL,
  },
  tmdbRating: {
    label: 'TMDB rating',
    description: 'TMDB rating (0-10 scale)',
    kind: 'number',
    evaluator: 'Ratings Router',
    appliesTo: 'both',
    operators: RATING_OPERATORS,
    control: TEN_SCALE_CONTROL,
  },
  genres: {
    label: 'Genres',
    description: 'Genre categories of the content',
    kind: 'textSet',
    evaluator: 'Genre Router',
    appliesTo: 'both',
    operators: {
      contains: { description: 'Content genre list contains this genre' },
      in: {
        description: 'Content has at least one of these genres',
        valueFormat: 'Array of genre names, e.g. ["Action", "Thriller"]',
      },
      notContains: {
        description: "Content genre list doesn't contain this genre",
      },
      notIn: {
        description: "Content doesn't have any of these genres",
        valueFormat: 'Array of genre names, e.g. ["Horror", "Comedy"]',
      },
      equals: {
        description: 'Content genres exactly match the provided genres',
        valueFormat: 'Single genre or array of all expected genres',
      },
      regex: {
        description: 'At least one genre matches the regular expression',
      },
    },
    control: {
      options: {
        source: 'genres',
        selectOperators: ['contains', 'notContains'],
      },
    },
  },
  user: {
    label: 'User',
    description: 'The user requesting the content (by ID or username)',
    kind: 'identity',
    evaluator: 'User Router',
    appliesTo: 'both',
    operators: {
      equals: { description: 'User matches exactly (by ID or username)' },
      notEquals: { description: 'User does not match (by ID or username)' },
      in: {
        description: 'User is one of the provided values',
        valueFormat:
          'Array of user IDs or usernames, e.g. ["admin", "john", 42]',
      },
      notIn: {
        description: 'User is not one of the provided values',
        valueFormat:
          'Array of user IDs or usernames to exclude, e.g. ["guest", 100]',
      },
      regex: { description: 'Username matches the regular expression' },
    },
    control: {
      options: { source: 'users', selectOperators: EQUALITY_SELECT },
    },
  },
  year: {
    label: 'Year',
    description: 'Release year of the content',
    kind: 'number',
    evaluator: 'Year Router',
    appliesTo: 'both',
    operators: {
      equals: { description: 'Year matches exactly' },
      notEquals: { description: 'Year does not match' },
      greaterThan: { description: 'Year is greater than value' },
      lessThan: { description: 'Year is less than value' },
      in: {
        description: 'Year is one of the provided values',
        valueFormat: 'Array of years, e.g. [1980, 1981, 1982]',
      },
      notIn: {
        description: 'Year is not any of the provided values',
        valueFormat: 'Array of years, e.g. [1980, 1981, 1982]',
      },
      between: {
        description: 'Year is within a range (inclusive)',
        valueFormat:
          'Object with min and/or max properties, e.g. { min: 1980, max: 1989 }',
      },
    },
    control: { min: 1900, max: 2100, step: 1, grouping: false },
  },
  season: {
    label: 'Season',
    description: 'Season number(s) of TV show',
    kind: 'number',
    evaluator: 'Season Router',
    appliesTo: 'sonarr',
    operators: {
      equals: { description: 'Season number matches exactly' },
      notEquals: { description: 'Season number does not match' },
      greaterThan: { description: 'Season number is greater than value' },
      lessThan: { description: 'Season number is less than value' },
      in: {
        description: 'Season is one of the provided values',
        valueFormat: 'Array of season numbers, e.g. [1, 2, 3]',
      },
      notIn: {
        description: 'Season is not any of the provided values',
        valueFormat: 'Array of season numbers, e.g. [1, 2, 3]',
      },
      between: {
        description: 'Season is within a range (inclusive)',
        valueFormat:
          'Object with min and/or max properties, e.g. { min: 1, max: 5 }',
      },
    },
  },
  language: {
    label: 'Language',
    description: 'Original language of the content',
    kind: 'text',
    evaluator: 'Language Router',
    appliesTo: 'both',
    operators: {
      equals: { description: 'Language matches exactly' },
      notEquals: { description: 'Language does not match' },
      contains: { description: 'Language name contains this string' },
      notContains: {
        description: 'Language name does not contain this string',
      },
      in: {
        description: 'Language is one of the provided values',
        valueFormat:
          'Array of language names, e.g. ["English", "French", "Japanese"]',
      },
      notIn: {
        description: 'Language is not any of the provided values',
        valueFormat:
          'Array of language names to exclude, e.g. ["English", "French"]',
      },
      regex: { description: 'Language matches the regular expression' },
    },
  },
  certification: {
    label: 'Certification',
    description: 'Content rating/certification (PG-13, R, TV-MA, etc.)',
    kind: 'text',
    evaluator: 'Certification Router',
    appliesTo: 'both',
    operators: {
      equals: { description: 'Certification matches exactly' },
      notEquals: { description: 'Certification does not match' },
      contains: { description: 'Certification contains this string' },
      notContains: {
        description: 'Certification does not contain this string',
      },
      in: {
        description: 'Certification is one of the provided values',
        valueFormat: 'Array of certifications, e.g. ["PG-13", "PG", "G"]',
      },
      notIn: {
        description: 'Certification is not one of the provided values',
        valueFormat: 'Array of certifications, e.g. ["R", "NC-17"]',
      },
      regex: { description: 'Certification matches the regular expression' },
    },
    control: {
      options: { source: 'certifications', selectOperators: EQUALITY_SELECT },
    },
  },
  seriesStatus: {
    label: 'Series status',
    description:
      'Series status from Sonarr (continuing, ended, upcoming, deleted)',
    kind: 'enum',
    evaluator: 'Series Status Router',
    appliesTo: 'sonarr',
    operators: {
      equals: { description: 'Series status matches exactly' },
      notEquals: { description: 'Series status does not match' },
      in: {
        description: 'Series status is one of the provided values',
        valueFormat: 'Array of statuses, e.g. ["continuing", "ended"]',
      },
      notIn: {
        description: 'Series status is not one of the provided values',
        valueFormat: 'Array of statuses, e.g. ["continuing", "ended"]',
      },
    },
    control: {
      options: { source: 'seriesStatuses', selectOperators: EQUALITY_SELECT },
    },
  },
  movieStatus: {
    label: 'Movie status',
    description:
      'Movie status from Radarr (tba, announced, inCinemas, released, deleted)',
    kind: 'enum',
    evaluator: 'Movie Status Router',
    appliesTo: 'radarr',
    operators: {
      equals: { description: 'Movie status matches exactly' },
      notEquals: { description: 'Movie status does not match' },
      in: {
        description: 'Movie status is one of the provided values',
        valueFormat: 'Array of statuses, e.g. ["released", "inCinemas"]',
      },
      notIn: {
        description: 'Movie status is not one of the provided values',
        valueFormat: 'Array of statuses, e.g. ["released", "inCinemas"]',
      },
    },
    control: {
      options: { source: 'movieStatuses', selectOperators: EQUALITY_SELECT },
    },
  },
  plexList: {
    label: 'Plex list',
    description: 'Plex custom list name owned by the requesting user',
    kind: 'textSet',
    evaluator: 'Plex List Router',
    appliesTo: 'both',
    valueTypes: ['string'],
    operators: {
      equals: {
        description: 'Item is on a list with this exact name',
        valueTypes: ['string'],
      },
      notEquals: {
        description: 'Item is not on a list with this exact name',
        valueTypes: ['string'],
      },
      contains: {
        description: 'Item is on a list whose name contains this string',
        valueTypes: ['string'],
      },
      notContains: {
        description: 'Item is not on any list whose name contains this string',
        valueTypes: ['string'],
      },
    },
  },
} as const satisfies { [F in RouterField]: FieldSpec }

export function isRouterField(value: string): value is RouterField {
  return Object.hasOwn(ROUTER_FIELDS, value)
}

export function fieldAllowsOperator(
  field: RouterField,
  operator: ComparisonOperator,
): boolean {
  return Object.hasOwn(ROUTER_FIELDS[field].operators, operator)
}

function isComparisonOperator(value: string): value is ComparisonOperator {
  return ComparisonOperatorSchema.safeParse(value).success
}

const CONDITIONAL_ROUTER_METADATA = {
  supportedFields: [
    {
      name: 'condition',
      description: 'Complex condition structure for advanced routing',
      valueTypes: ['object'],
    },
  ],
  supportedOperators: {
    condition: [
      {
        name: 'equals',
        description: 'Condition structure matches exactly',
        valueTypes: ['object'],
      },
      {
        name: 'contains',
        description: 'Condition structure contains the specified rules',
        valueTypes: ['object'],
      },
    ],
  },
} satisfies Pick<EvaluatorMetadata, 'supportedFields' | 'supportedOperators'>

const FIELD_SPECS: ReadonlyArray<readonly [string, FieldSpec]> =
  Object.entries(ROUTER_FIELDS)

function operatorMetadata(spec: FieldSpec) {
  return Object.keys(spec.operators)
    .filter(isComparisonOperator)
    .flatMap((operator) => {
      const operatorSpec = spec.operators[operator]
      if (!operatorSpec) return []
      const valueTypes =
        operatorSpec.valueTypes ??
        KIND_VALUE_TYPES[spec.kind].operators[operator] ??
        []
      return [
        {
          name: operator,
          description: operatorSpec.description,
          valueTypes: [...valueTypes],
          ...(operatorSpec.valueFormat === undefined
            ? {}
            : { valueFormat: operatorSpec.valueFormat }),
        },
      ]
    })
}

export function evaluatorMetadata(): EvaluatorMetadata[] {
  return ROUTER_EVALUATORS.map(
    ({ name, description, priority, contentType }) => {
      if (name === 'Conditional Router') {
        return {
          name,
          description,
          priority,
          ...CONDITIONAL_ROUTER_METADATA,
          contentType,
        }
      }
      const fields = FIELD_SPECS.filter(
        ([, spec]) => spec.evaluator === name && !spec.hidden,
      )
      return {
        name,
        description,
        priority,
        supportedFields: fields.map(([field, spec]) => ({
          name: field,
          description: spec.description,
          valueTypes: [
            ...(spec.valueTypes ?? KIND_VALUE_TYPES[spec.kind].field),
          ],
        })),
        supportedOperators: Object.fromEntries(
          fields.map(([field, spec]) => [field, operatorMetadata(spec)]),
        ),
        contentType,
      }
    },
  )
}
