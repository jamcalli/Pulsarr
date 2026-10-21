import { ContentTypeSchema } from '@root/schemas/common/content-type.schema.js'
import { InstanceTypeSchema } from '@root/schemas/common/instance-type.schema.js'
import { WatchlistStatusSchema } from '@root/schemas/common/watchlist-status.schema.js'
import { z } from 'zod'

export const RecentRequestStatusSchema = z
  .enum(['pending_approval', 'pending', 'requested', 'grabbed', 'notified'])
  .meta({
    id: 'RecentRequestStatus',
    description:
      'Request status, pending_approval from the approval queue, otherwise the highest watchlist status across routed instances',
  })

export const InstanceInfoSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    instanceType: InstanceTypeSchema,
    junctionStatus: WatchlistStatusSchema,
  })
  .meta({
    id: 'RecentRequestInstance',
    description:
      'One arr instance a recent request was routed to, with its watchlist status on that instance',
  })

export const RecentRequestItemSchema = z
  .object({
    id: z.number(),
    source: z.enum(['approval', 'watchlist']),
    title: z.string(),
    key: z.string(),
    contentType: ContentTypeSchema,
    guids: z.array(z.string()),
    thumb: z.string().nullable(),
    status: RecentRequestStatusSchema,
    userId: z.number(),
    userName: z.string(),
    createdAt: z.string(),
    statusTimes: z
      .object({
        requested: z.string().nullable(),
        grabbed: z.string().nullable(),
        notified: z.string().nullable(),
      })
      .meta({
        id: 'RecentRequestStatusTimes',
        description:
          'When the item first reached each watchlist status, null when there is no record',
      }),
    primaryInstance: InstanceInfoSchema.nullable(),
    allInstances: z.array(InstanceInfoSchema),
  })
  .meta({
    id: 'RecentRequestItem',
    description:
      'A pending approval or routed watchlist item shown in recent requests',
  })

export type RecentRequestStatus = z.infer<typeof RecentRequestStatusSchema>
export type InstanceInfo = z.infer<typeof InstanceInfoSchema>
export type RecentRequestItem = z.infer<typeof RecentRequestItemSchema>
