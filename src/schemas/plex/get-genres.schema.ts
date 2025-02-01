import { z } from 'zod'

export const WatchlistGenreCountSchema = z.object({
  genre: z.string(),
  count: z.number()
})

export const WatchlistGenresResponseSchema = z.object({
  success: z.boolean(),
  genres: z.array(WatchlistGenreCountSchema),
})

export const WatchlistGenresErrorSchema = z.object({
  error: z.string(),
})

export type WatchlistGenreCount = z.infer<typeof WatchlistGenreCountSchema>
export type WatchlistGenresResponse = z.infer<typeof WatchlistGenresResponseSchema>
export type WatchlistGenresError = z.infer<typeof WatchlistGenresErrorSchema>