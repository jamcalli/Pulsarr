import { z } from 'zod'

const urlWithoutTrailingSlash = z
  .string()
  .url({ error: 'Please enter a valid URL' })
  .refine((val) => !val.endsWith('/'), {
    message: 'URL should not end with a trailing slash (/)',
  })

const minimumAvailabilityEnum = z.enum(['announced', 'inCinemas', 'released'])

const baseObjectSchema = z.object({
  name: z.string().min(1, { error: 'Name is required' }),
  baseUrl: urlWithoutTrailingSlash,
  apiKey: z.string().min(1, { error: 'API Key is required' }),
  bypassIgnored: z.boolean(),
  searchOnAdd: z.boolean().default(true),
  minimumAvailability: minimumAvailabilityEnum.default('released'),
  tags: z.array(z.string()),
  isDefault: z.boolean(),
  syncedInstances: z.array(z.number()).optional(),
  _connectionTested: z.boolean().optional(),
  _originalBaseUrl: z.string().optional(),
  _originalApiKey: z.string().optional(),
})

export const baseInstanceSchema = baseObjectSchema.superRefine((data, ctx) => {
  const hasChangedApiSettings =
    (data._originalBaseUrl !== undefined &&
      data._originalBaseUrl !== data.baseUrl) ||
    (data._originalApiKey !== undefined && data._originalApiKey !== data.apiKey)

  if (
    data.baseUrl &&
    !data.baseUrl.endsWith('/') &&
    data.apiKey &&
    !data._connectionTested &&
    ((data._originalBaseUrl === undefined &&
      data._originalApiKey === undefined) ||
      hasChangedApiSettings)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Please test connection before continuing',
      path: ['apiKey'],
    })
  }
})

const initialObjectSchema = baseObjectSchema.extend({
  qualityProfile: z.string(),
  rootFolder: z.string(),
})

const fullObjectSchema = baseObjectSchema.extend({
  qualityProfile: z.string().min(1, { error: 'Quality Profile is required' }),
  rootFolder: z.string().min(1, { error: 'Root Folder is required' }),
})

export const initialInstanceSchema = initialObjectSchema.superRefine(
  (data, ctx) => {
    const hasChangedApiSettings =
      (data._originalBaseUrl !== undefined &&
        data._originalBaseUrl !== data.baseUrl) ||
      (data._originalApiKey !== undefined &&
        data._originalApiKey !== data.apiKey)

    if (
      data.baseUrl &&
      !data.baseUrl.endsWith('/') &&
      data.apiKey &&
      !data._connectionTested &&
      ((data._originalBaseUrl === undefined &&
        data._originalApiKey === undefined) ||
        hasChangedApiSettings)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Please test connection before continuing',
        path: ['apiKey'],
      })
    }
  },
)

export const fullInstanceSchema = fullObjectSchema.superRefine((data, ctx) => {
  const hasChangedApiSettings =
    (data._originalBaseUrl !== undefined &&
      data._originalBaseUrl !== data.baseUrl) ||
    (data._originalApiKey !== undefined && data._originalApiKey !== data.apiKey)

  if (
    data.baseUrl &&
    !data.baseUrl.endsWith('/') &&
    data.apiKey &&
    !data._connectionTested &&
    ((data._originalBaseUrl === undefined &&
      data._originalApiKey === undefined) ||
      hasChangedApiSettings)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Please test connection before continuing',
      path: ['apiKey'],
    })
  }
})

export type RadarrInstanceSchema = z.input<typeof fullInstanceSchema>

export const genreRouteSchema = z.object({
  name: z.string().min(2, {
    error: 'Route name must be at least 2 characters.',
  }),
  genre: z.string().min(1, {
    error: 'Genre is required.',
  }),
  radarrInstanceId: z.number().min(1, {
    error: 'Instance selection is required.',
  }),
  rootFolder: z.string().min(1, {
    error: 'Root folder is required.',
  }),
  qualityProfile: z.string().min(1, {
    error: 'Quality Profile is required',
  }),
})

export type GenreRouteFormValues = z.infer<typeof genreRouteSchema>
