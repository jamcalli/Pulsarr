import { ContentTypeSchema } from '@root/schemas/common/content-type.schema.js'
import { InstanceTypeSchema } from '@root/schemas/common/instance-type.schema.js'
import { WatchlistStatusSchema } from '@root/schemas/common/watchlist-status.schema.js'
import { z } from 'zod'

export const RecentRequestStatusSchema = z
  .enum(['pending_approval', 'pending', 'requested', 'available'])
  .meta({
    id: 'RecentRequestStatus',
    description:
      'Collapsed request status, where pending_approval comes from the approval queue',
  })

export const InstanceStatusSchema = z
  .enum(['pending', 'requested', 'available'])
  .meta({
    id: 'RecentRequestInstanceStatus',
    description:
      'Collapsed per-instance status, never pending_approval since approvals are not routed yet',
  })

export const InstanceInfoSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    instanceType: InstanceTypeSchema,
    status: InstanceStatusSchema,
    junctionStatus: WatchlistStatusSchema,
  })
  .meta({
    id: 'RecentRequestInstance',
    description:
      'One arr instance a recent request was routed to, with its collapsed and raw status',
  })

export const RecentRequestItemSchema = z
  .object({
    id: z.number(),
    source: z.enum(['approval', 'watchlist']),
    title: z.string(),
    contentType: ContentTypeSchema,
    guids: z.array(z.string()),
    thumb: z.string().nullable(),
    status: RecentRequestStatusSchema,
    userId: z.number(),
    userName: z.string(),
    createdAt: z.string(),
    primaryInstance: InstanceInfoSchema.nullable(),
    allInstances: z.array(InstanceInfoSchema),
  })
  .meta({
    id: 'RecentRequestItem',
    description:
      'A pending approval or routed watchlist item shown in recent requests',
  })

// Query parameters
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

// Type exports
export type RecentRequestStatus = z.infer<typeof RecentRequestStatusSchema>
export type InstanceStatus = z.infer<typeof InstanceStatusSchema>
export type InstanceInfo = z.infer<typeof InstanceInfoSchema>
export type RecentRequestItem = z.infer<typeof RecentRequestItemSchema>
export type RecentRequestsQuery = z.infer<typeof RecentRequestsQuerySchema>
export type RecentRequestsResponse = z.infer<
  typeof RecentRequestsResponseSchema
>
