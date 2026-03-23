import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'
import { TmdbWatchProviderSchema } from './tmdb.schema.js'

export const ProvidersResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  region: z.string(),
  providers: z.array(TmdbWatchProviderSchema),
})

export type ProvidersResponse = z.infer<typeof ProvidersResponseSchema>

// Re-export shared error schema with domain-specific alias
export { ErrorSchema as ProvidersErrorSchema }
export type ProvidersError = z.infer<typeof ErrorSchema>
