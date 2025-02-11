import { z } from 'zod'

export const baseInstanceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  baseUrl: z.string().url({ message: 'Please enter a valid URL' }),
  apiKey: z.string().min(1, { message: 'API Key is required' }),
  bypassIgnored: z.boolean(),
  tags: z.array(z.string()),
  isDefault: z.boolean(),
  syncedInstances: z.array(z.number()).optional(),
})

export const initialInstanceSchema = baseInstanceSchema.extend({
  qualityProfile: z.string(),
  rootFolder: z.string(),
})

export const fullInstanceSchema = baseInstanceSchema.extend({
  qualityProfile: z.string().min(1, 'Quality Profile is required'),
  rootFolder: z.string().min(1, 'Root Folder is required'),
})

export type RadarrInstanceSchema = z.infer<typeof fullInstanceSchema>

export const genreRouteSchema = z.object({
  name: z.string().min(2, {
    message: 'Route name must be at least 2 characters.',
  }),
  genre: z.string().min(1, {
    message: 'Genre is required.',
  }),
  radarrInstanceId: z.number().min(1, {
    message: 'Instance selection is required.',
  }),
  rootFolder: z.string().min(1, {
    message: 'Root folder is required.',
  }),
})

export type GenreRouteFormValues = z.infer<typeof genreRouteSchema>
