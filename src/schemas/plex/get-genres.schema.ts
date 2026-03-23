import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const WatchlistGenresResponseSchema = z.object({
  success: z.boolean(),
  genres: z.array(z.string()),
})

export type WatchlistGenresResponse = z.infer<
  typeof WatchlistGenresResponseSchema
>

export { ErrorSchema as WatchlistGenresErrorSchema }
export type WatchlistGenresError = z.infer<typeof ErrorSchema>
