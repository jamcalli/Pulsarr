import { z } from 'zod'
import type { SonarrMonitoringType } from '../types/types'
import { SONARR_MONITORING_OPTIONS } from './constants'

const urlWithoutTrailingSlash = z
  .string()
  .url({ message: 'Please enter a valid URL' })
  .refine((val) => !val.endsWith('/'), {
    message: 'URL should not end with a trailing slash (/)',
  })

const baseObjectSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  baseUrl: urlWithoutTrailingSlash,
  apiKey: z.string().min(1, { message: 'API Key is required' }),
  bypassIgnored: z.boolean(),
  seasonMonitoring: z.custom<SonarrMonitoringType>((val) =>
    Object.keys(SONARR_MONITORING_OPTIONS).includes(val as string),
  ),
  monitorNewItems: z.enum(['all', 'none']).default('all'),
  searchOnAdd: z.boolean().default(true),
  createSeasonFolders: z.boolean().default(false),
  tags: z.array(z.string()),
  isDefault: z.boolean(),
  syncedInstances: z.array(z.number()).optional(),
  seriesType: z.enum(['standard', 'anime', 'daily']).default('standard'),
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
  qualityProfile: z.string().min(1, 'Quality Profile is required'),
  rootFolder: z.string().min(1, 'Root Folder is required'),
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

export type SonarrInstanceSchema = z.infer<typeof fullObjectSchema>

export const genreRouteSchema = z.object({
  name: z.string().min(2, {
    message: 'Route name must be at least 2 characters.',
  }),
  genre: z.string().min(1, {
    message: 'Genre is required.',
  }),
  sonarrInstanceId: z.number().min(1, {
    message: 'Instance selection is required.',
  }),
  rootFolder: z.string().min(1, {
    message: 'Root folder is required.',
  }),
  qualityProfile: z.string().min(1, {
    message: 'Quality Profile is required',
  }),
})

export type GenreRouteFormValues = z.infer<typeof genreRouteSchema>
