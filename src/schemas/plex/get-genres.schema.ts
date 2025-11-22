import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const WatchlistGenresResponseSchema = z.object({
  success: z.literal(true),
  genres: z.array(z.string()),
})

export type WatchlistGenresResponse = z.infer<
  typeof WatchlistGenresResponseSchema
>

// Re-export shared error schema with domain-specific alias
export { ErrorSchema as WatchlistGenresErrorSchema }
export type WatchlistGenresError = z.infer<typeof ErrorSchema>
