import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const UserStatsSchema = z
  .object({
    watchlist: z.object({
      pending: z.number(),
      requested: z.number(),
      grabbed: z.number(),
      notified: z.number(),
      total: z.number(),
    }),
    notificationsSent: z.number(),
    pendingApprovals: z.number(),
  })
  .meta({
    id: 'UserStats',
    description:
      'Counts for one user across their watchlist, notifications and approvals',
  })

export const GetUserStatsParamsSchema = z.object({
  id: z.coerce.number(),
})

export const GetUserStatsResponseSchema = z.object({
  success: z.boolean(),
  stats: UserStatsSchema,
})

export type UserStats = z.infer<typeof UserStatsSchema>
export type GetUserStatsParams = z.infer<typeof GetUserStatsParamsSchema>
export type GetUserStatsResponse = z.infer<typeof GetUserStatsResponseSchema>

export { ErrorSchema as UserStatsErrorSchema }
