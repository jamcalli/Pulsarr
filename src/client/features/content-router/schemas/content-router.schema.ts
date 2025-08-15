import {
  ComparisonOperatorSchema,
  ConditionValueSchema,
} from '@root/schemas/content-router/content-router.schema'
import { z } from 'zod'
import { ROUTER_SERIES_TYPES } from '../constants'

export type ConditionValue = z.infer<typeof ConditionValueSchema>

// Define interface for a basic condition
export interface ICondition {
  field: string
  operator: z.infer<typeof ComparisonOperatorSchema>
  value: ConditionValue
  negate?: boolean
  _cid?: string
}

// Define interface for a condition group
export interface IConditionGroup {
  operator: 'AND' | 'OR'
  conditions: (ICondition | IConditionGroup)[]
  negate?: boolean
  _cid?: string
}

// Define schema for a basic condition - with proper type annotation and stricter value typing
export const ConditionSchema: z.ZodType<ICondition> = z.lazy(() =>
  z.object({
    field: z.string(),
    operator: ComparisonOperatorSchema,
    value: ConditionValueSchema, // Using our strictly typed value schema
    negate: z.boolean().optional().default(false),
    _cid: z.string().optional(),
  }),
)

// Define schema for a condition group - with proper type annotation
// Helper function to validate group recursion safely
const isValidGroup = (
  group: IConditionGroup,
  depth = 0,
  visited = new WeakSet(),
): boolean => {
  // Guard against excessive nesting
  if (depth >= 20) {
    return false
  }

  // Guard against circular references
  if (visited.has(group)) {
    return false
  }
  visited.add(group)

  if (!group.conditions || group.conditions.length === 0) {
    return false // Require at least one condition to match server validation
  }

  return group.conditions.every((cond) => {
    if ('conditions' in cond) {
      return isValidGroup(cond as IConditionGroup, depth + 1, visited)
    }
    return true // Individual conditions validated by their own schema
  })
}

export const ConditionGroupSchema: z.ZodType<IConditionGroup> = z.lazy(() =>
  z
    .object({
      operator: z.enum(['AND', 'OR']),
      conditions: z.array(
        z.union([ConditionSchema, z.lazy(() => ConditionGroupSchema)]),
      ),
      negate: z.boolean().optional().default(false),
      _cid: z.string().optional(),
    })
    .refine((group) => isValidGroup(group), {
      message:
        'Condition groups must contain at least one condition and cannot exceed 20 levels or contain circular references',
    }),
)

// Schema for a conditional route - enhanced validation for all conditions
export const ConditionalRouteFormSchema = z.object({
  name: z.string().min(2, {
    error: 'Route name must be at least 2 characters.',
  }),
  condition: ConditionGroupSchema,
  target_instance_id: z.coerce.number().int().min(1, {
    error: 'Instance selection is required.',
  }),
  root_folder: z.string().min(1, {
    error: 'Root folder is required.',
  }),
  quality_profile: z.string().min(1, {
    error: 'Quality Profile is required',
  }),
  tags: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  order: z.number().int().min(1).max(100).default(50),
  search_on_add: z.boolean().default(true),
  season_monitoring: z.string().optional(),
  series_type: z.enum([...ROUTER_SERIES_TYPES, 'none'] as const).optional(),
  // Actions section - approval behavior
  always_require_approval: z.boolean().default(false),
  bypass_user_quotas: z.boolean().default(false),
  approval_reason: z.string().optional(),
})

export type ConditionalRouteFormValues = z.infer<
  typeof ConditionalRouteFormSchema
>

// Keep backward compatibility with existing route schemas
export const GenreRouteFormSchema = z.object({
  name: z.string().min(2, {
    error: 'Route name must be at least 2 characters.',
  }),
  genre: z.union([
    z.string().min(1, { error: 'Genre is required.' }),
    z.array(z.string().min(1, { error: 'Each genre must not be empty.' })),
  ]),
  target_instance_id: z.coerce.number().int().min(1, {
    error: 'Instance selection is required.',
  }),
  root_folder: z.string().min(1, {
    error: 'Root folder is required.',
  }),
  quality_profile: z.string().min(1, {
    error: 'Quality Profile is required',
  }),
  tags: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  order: z.number().int().min(1).max(100).default(50),
})

export type GenreRouteFormValues = z.infer<typeof GenreRouteFormSchema>

export const YearCriteriaFormSchema = z
  .discriminatedUnion('matchType', [
    // Exact year
    z.object({
      matchType: z.literal('exact'),
      year: z.coerce.number().int().min(1900).max(2100),
    }),
    // Year range
    z.object({
      matchType: z.literal('range'),
      minYear: z.coerce.number().int().min(1900).max(2100).optional(),
      maxYear: z.coerce.number().int().min(1900).max(2100).optional(),
    }),
    // Year list
    z.object({
      matchType: z.literal('list'),
      years: z.string(),
    }),
  ])
  .refine(
    (data) => {
      if (data.matchType === 'range') {
        return data.minYear !== undefined || data.maxYear !== undefined
      }
      return true
    },
    {
      message: 'At least one of min or max year must be specified',
      path: ['minYear'],
    },
  )
  .refine(
    (data) => {
      if (
        data.matchType === 'range' &&
        data.minYear !== undefined &&
        data.maxYear !== undefined
      ) {
        return data.minYear <= data.maxYear
      }
      return true
    },
    {
      message: 'Min year cannot be greater than max year',
      path: ['minYear'],
    },
  )
  .refine(
    (data) => {
      if (data.matchType === 'list') {
        const years = data.years
          .split(',')
          .map((y) => Number.parseInt(y.trim()))
          .filter((y) => !Number.isNaN(y))
        return years.length > 0 && years.every((y) => y >= 1900 && y <= 2100)
      }
      return true
    },
    {
      message:
        'Please enter valid years between 1900-2100, separated by commas',
      path: ['years'],
    },
  )

export const YearRouteFormSchema = z.object({
  name: z.string().min(2, {
    error: 'Route name must be at least 2 characters.',
  }),
  target_instance_id: z.coerce.number().int().min(1, {
    error: 'Instance selection is required.',
  }),
  root_folder: z.string().min(1, {
    error: 'Root folder is required.',
  }),
  quality_profile: z.string().min(1, {
    error: 'Quality Profile is required',
  }),
  tags: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  yearCriteria: YearCriteriaFormSchema,
  order: z.number().int().min(1).max(100).default(50),
})

export type YearRouteFormValues = z.infer<typeof YearRouteFormSchema>
export type YearCriteriaFormValues = z.infer<typeof YearCriteriaFormSchema>

export const LanguageRouteFormSchema = z.object({
  name: z.string().min(2, {
    error: 'Route name must be at least 2 characters.',
  }),
  language: z.string().min(1, {
    error: 'Language is required.',
  }),
  target_instance_id: z.coerce.number().int().min(1, {
    error: 'Instance selection is required.',
  }),
  root_folder: z.string().min(1, {
    error: 'Root folder is required.',
  }),
  quality_profile: z.string().min(1, {
    error: 'Quality Profile is required',
  }),
  tags: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  order: z.number().int().min(1).max(100).default(50),
})

export type LanguageRouteFormValues = z.infer<typeof LanguageRouteFormSchema>

export const UserRouteFormSchema = z.object({
  name: z.string().min(2, {
    error: 'Route name must be at least 2 characters.',
  }),
  users: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => (Array.isArray(val) ? val : [val])),
  target_instance_id: z.coerce.number().int().min(1, {
    error: 'Instance selection is required.',
  }),
  root_folder: z.string().min(1, {
    error: 'Root folder is required.',
  }),
  quality_profile: z.string().min(1, {
    error: 'Quality Profile is required',
  }),
  tags: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  order: z.number().int().min(1).max(100).default(50),
})

export type UserRouteFormValues = z.infer<typeof UserRouteFormSchema>
