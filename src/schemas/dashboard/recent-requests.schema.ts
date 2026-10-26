import {
  RecentRequestItemSchema,
  RecentRequestStatusSchema,
} from '@root/schemas/shared/recent-request.schema.js'
import { z } from 'zod'

export const RecentRequestsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(50).default(10),
  status: RecentRequestStatusSchema.optional(),
})

export const RecentRequestsResponseSchema = z
  .object({
    success: z.boolean(),
    items: z.array(RecentRequestItemSchema),
  })
  .meta({
    id: 'RecentRequestsResponse',
    description: 'Recent requests for the dashboard, newest first',
  })

export type RecentRequestsQuery = z.infer<typeof RecentRequestsQuerySchema>
export type RecentRequestsResponse = z.infer<
  typeof RecentRequestsResponseSchema
>
