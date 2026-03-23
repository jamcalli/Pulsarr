import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

const WatchlistItemSchema = z.object({
  title: z.string(),
  key: z.string(),
  type: z.string(),
  thumb: z.string().nullable(),
  guids: z.array(z.string()),
  genres: z.array(z.string()),
  status: z.enum(['pending', 'requested', 'grabbed', 'notified']),
  added: z.string().nullable(),
})

const UserInfoSchema = z.object({
  id: z.number(),
  name: z.string(),
})

export const GetUserWatchlistParamsSchema = z.object({
  userId: z.string().transform(Number),
})

export const GetUserWatchlistResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    user: UserInfoSchema,
    watchlistItems: z.array(WatchlistItemSchema),
    total: z.number(),
  }),
})

export type GetUserWatchlistParams = z.infer<
  typeof GetUserWatchlistParamsSchema
>
export type GetUserWatchlistResponse = z.infer<
  typeof GetUserWatchlistResponseSchema
>
export type WatchlistItem = z.infer<typeof WatchlistItemSchema>
export { ErrorSchema as GetUserWatchlistErrorSchema }
export type GetUserWatchlistError = z.infer<typeof ErrorSchema>
