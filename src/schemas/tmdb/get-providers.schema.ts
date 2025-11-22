import { z } from 'zod'
import { TmdbWatchProviderSchema } from './tmdb.schema.js'

export const ProvidersResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  region: z.string(),
  providers: z.array(TmdbWatchProviderSchema),
})

export const ProvidersErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
})

export type ProvidersResponse = z.infer<typeof ProvidersResponseSchema>
export type ProvidersError = z.infer<typeof ProvidersErrorSchema>
