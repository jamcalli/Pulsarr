import { z } from 'zod'

// Status enum for recent requests (includes pending_approval from approvals table)
export const RecentRequestStatusSchema = z.enum([
  'pending_approval',
  'pending',
  'requested',
  'available',
])

// Status enum for instances (subset - instances can't have pending_approval)
export const InstanceStatusSchema = z.enum(['pending', 'requested', 'available'])

// Instance info schema
export const InstanceInfoSchema = z.object({
  id: z.number(),
  name: z.string(),
  instanceType: z.enum(['radarr', 'sonarr']),
  status: InstanceStatusSchema,
})

// Individual recent request item
export const RecentRequestItemSchema = z.object({
  id: z.number(),
  source: z.enum(['approval', 'watchlist']),
  title: z.string(),
  contentType: z.enum(['movie', 'show']),
  guids: z.array(z.string()),
  thumb: z.string().nullable(),
  status: RecentRequestStatusSchema,
  userId: z.number(),
  userName: z.string(),
  createdAt: z.string(),
  primaryInstance: InstanceInfoSchema.nullable(),
  allInstances: z.array(InstanceInfoSchema),
})

// Query parameters
export const RecentRequestsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(50).default(10),
  status: RecentRequestStatusSchema.optional(),
})

// Response schema
export const RecentRequestsResponseSchema = z.object({
  success: z.boolean(),
  items: z.array(RecentRequestItemSchema),
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
