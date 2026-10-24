import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { RecentRequestItemSchema } from '@root/schemas/shared/recent-request.schema.js'
import { z } from 'zod'

const UserInfoSchema = z.object({
  id: z.number(),
  name: z.string(),
})

export const GetUserWatchlistParamsSchema = z.object({
  userId: z.coerce.number(),
})

export const GetUserWatchlistResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    user: UserInfoSchema,
    items: z.array(RecentRequestItemSchema),
    total: z.number(),
  }),
})

export type GetUserWatchlistParams = z.infer<
  typeof GetUserWatchlistParamsSchema
>
export type GetUserWatchlistResponse = z.infer<
  typeof GetUserWatchlistResponseSchema
>

export { ErrorSchema as GetUserWatchlistErrorSchema }
export type GetUserWatchlistError = z.infer<typeof ErrorSchema>
