import { z } from 'zod'

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

export const UserCriteriaFormSchema = z.object({
  ids: z
    .union([z.number().positive(), z.array(z.number().positive())])
    .optional(),
  names: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
})

export const UserRouteFormSchema = z.object({
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
  userCriteria: UserCriteriaFormSchema,
  order: z.number().int().min(1).max(100).default(50),
})

export type UserRouteFormValues = z.infer<typeof UserRouteFormSchema>
