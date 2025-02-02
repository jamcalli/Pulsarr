import { z } from 'zod'

export const WatchlistGenresResponseSchema = z.object({
  success: z.boolean(),
  genres: z.array(z.string()),
})

export const WatchlistGenresErrorSchema = z.object({
  error: z.string(),
})

export type WatchlistGenresResponse = z.infer<typeof WatchlistGenresResponseSchema>
export type WatchlistGenresError = z.infer<typeof WatchlistGenresErrorSchema>