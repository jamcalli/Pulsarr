import { z } from 'zod'

// Define schemas for condition value types
const ConditionValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.array(z.number()),
  z.object({
    min: z.number().optional(),
    max: z.number().optional(),
  }),
  z.null(),
])

export type ConditionValue = z.infer<typeof ConditionValueSchema>

// Define interface for a basic condition
export interface ICondition {
  field: string
  operator: string
  value: ConditionValue
  negate?: boolean
  _cid?: string // Optional unique identifier
}

// Define interface for a condition group
export interface IConditionGroup {
  operator: 'AND' | 'OR'
  conditions: (ICondition | IConditionGroup)[]
  negate?: boolean
  _cid?: string // Optional unique identifier
}

// Define schema for a basic condition - with proper type annotation
export const ConditionSchema: z.ZodType<ICondition> = z.lazy(() =>
  z.object({
    field: z.string(),
    operator: z.string(),
    value: ConditionValueSchema,
    negate: z.boolean().optional().default(false),
    _cid: z.string().optional(), // Add optional unique identifier
  }),
)

// Define schema for a condition group - with proper type annotation and improved lazy references
export const ConditionGroupSchema: z.ZodType<IConditionGroup> = z.lazy(() =>
  z.object({
    operator: z.enum(['AND', 'OR']),
    // Use a second lazy closure to avoid temporal dead zone issues
    conditions: z.array(
      z.union([
        ConditionSchema,
        z.lazy(() => ConditionGroupSchema),
      ]),
    ),
    negate: z.boolean().optional().default(false),
    _cid: z.string().optional(), // Add optional unique identifier
  }),
)

// Schema for a conditional route - enhanced validation for all conditions
export const ConditionalRouteFormSchema = z.object({
  name: z.string().min(2, {
    message: 'Route name must be at least 2 characters.',
  }),
  condition: ConditionGroupSchema.refine(
    (val) => {
      // Helper function to validate a single condition
      const isValidCondition = (cond: ICondition) => {
        if ('field' in cond && 'operator' in cond && 'value' in cond) {
          const hasField = Boolean(cond.field)
          const hasOperator = Boolean(cond.operator)
          const hasValue =
            cond.value !== undefined &&
            cond.value !== null &&
            (typeof cond.value !== 'string' || cond.value.trim() !== '') &&
            (!Array.isArray(cond.value) || cond.value.length > 0)

          return hasField && hasOperator && hasValue
        }
        return false
      }

      // Helper function to recursively validate condition groups
      const isValidGroup = (group: IConditionGroup): boolean => {
        if (!group.conditions || group.conditions.length === 0) {
          return false
        }

        return group.conditions.every((cond) => {
          if ('conditions' in cond) {
            // Recursive check for nested groups
            return isValidGroup(cond as IConditionGroup)
          }

          // Check individual condition
          return isValidCondition(cond as ICondition)
        })
      }

      return isValidGroup(val)
    },
    {
      message: 'All conditions must be completely filled out',
    },
  ),
  target_instance_id: z.number().min(1, {
    message: 'Instance selection is required.',
  }),
  root_folder: z.string().min(1, {
    message: 'Root folder is required.',
  }),
  quality_profile: z.string().min(1, {
    message: 'Quality Profile is required',
  }),
  enabled: z.boolean().default(true),
  order: z.number().int().min(1).max(100).default(50),
})

export type ConditionalRouteFormValues = z.infer<
  typeof ConditionalRouteFormSchema
>

// Keep backward compatibility with existing route schemas
export const GenreRouteFormSchema = z.object({
  name: z.string().min(2, {
    message: 'Route name must be at least 2 characters.',
  }),
  genre: z.union([
    z.string().min(1, { message: 'Genre is required.' }),
    z.array(z.string().min(1, { message: 'Each genre must not be empty.' })),
  ]),
  target_instance_id: z.number().positive({
    message: 'Instance selection is required.',
  }),
  root_folder: z.string().min(1, {
    message: 'Root folder is required.',
  }),
  quality_profile: z.string().min(1, {
    message: 'Quality Profile is required',
  }),
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
    message: 'Route name must be at least 2 characters.',
  }),
  target_instance_id: z.number().min(1, {
    message: 'Instance selection is required.',
  }),
  root_folder: z.string().min(1, {
    message: 'Root folder is required.',
  }),
  quality_profile: z.string().min(1, {
    message: 'Quality Profile is required',
  }),
  enabled: z.boolean().default(true),
  yearCriteria: YearCriteriaFormSchema,
  order: z.number().int().min(1).max(100).default(50),
})

export type YearRouteFormValues = z.infer<typeof YearRouteFormSchema>
export type YearCriteriaFormValues = z.infer<typeof YearCriteriaFormSchema>

export const LanguageRouteFormSchema = z.object({
  name: z.string().min(2, {
    message: 'Route name must be at least 2 characters.',
  }),
  language: z.string().min(1, {
    message: 'Language is required.',
  }),
  target_instance_id: z.number().positive({
    message: 'Instance selection is required.',
  }),
  root_folder: z.string().min(1, {
    message: 'Root folder is required.',
  }),
  quality_profile: z.string().min(1, {
    message: 'Quality Profile is required',
  }),
  enabled: z.boolean().default(true),
  order: z.number().int().min(1).max(100).default(50),
})

export type LanguageRouteFormValues = z.infer<typeof LanguageRouteFormSchema>

export const UserRouteFormSchema = z.object({
  name: z.string().min(2, {
    message: 'Route name must be at least 2 characters.',
  }),
  users: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => (Array.isArray(val) ? val : [val])),
  target_instance_id: z.number().min(1, {
    message: 'Instance selection is required.',
  }),
  root_folder: z.string().min(1, {
    message: 'Root folder is required.',
  }),
  quality_profile: z.string().min(1, {
    message: 'Quality Profile is required',
  }),
  enabled: z.boolean().default(true),
  order: z.number().int().min(1).max(100).default(50),
})

export type UserRouteFormValues = z.infer<typeof UserRouteFormSchema>