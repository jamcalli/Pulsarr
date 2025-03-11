import { z } from 'zod'

// Common schemas for statistics
export const GenreStatSchema = z.object({
  genre: z.string(),
  count: z.number(),
})

export const ContentStatSchema = z.object({
  title: z.string(),
  count: z.number(),
  thumb: z.string().nullable(),
})

export const UserStatSchema = z.object({
  name: z.string(),
  count: z.number(),
})

export const StatusDistributionSchema = z.object({
  status: z.string(),
  count: z.number(),
})

export const ContentTypeDistributionSchema = z.object({
  type: z.string(),
  count: z.number(),
})

export const ActivityStatsSchema = z.object({
  new_watchlist_items: z.number(),
  status_changes: z.number(),
  notifications_sent: z.number(),
})

export const InstanceStatSchema = z.object({
  instance_id: z.number(),
  instance_type: z.enum(['sonarr', 'radarr']),
  name: z.string(),
  item_count: z.number(),
})

export const AvailabilityTimeSchema = z.object({
  content_type: z.string(),
  avg_days: z.number(),
  min_days: z.number(),
  max_days: z.number(),
  count: z.number(),
  median_days: z.number().optional(),
})

export const StatusTransitionTimeSchema = z.object({
  from_status: z.string(),
  to_status: z.string(),
  content_type: z.string(),
  avg_days: z.number(),
  min_days: z.number(),
  max_days: z.number(),
  count: z.number(),
})

export const StatusFlowDataSchema = z.object({
  from_status: z.string(),
  to_status: z.string(),
  content_type: z.string(),
  count: z.number(),
  avg_days: z.number(),
})

export const GrabbedToNotifiedTimeSchema = z.object({
  content_type: z.string(),
  avg_days: z.number(),
  min_days: z.number(),
  max_days: z.number(),
  median_days: z.number().optional(),
  count: z.number(),
})

export const NotificationChannelStatSchema = z.object({
  channel: z.string(),
  count: z.number(),
})

export const NotificationTypeStatSchema = z.object({
  type: z.string(),
  count: z.number(),
})

export const NotificationUserStatSchema = z.object({
  user_name: z.string(),
  count: z.number(),
})

export const NotificationStatsSchema = z.object({
  total_notifications: z.number(),
  by_type: z.array(NotificationTypeStatSchema),
  by_channel: z.array(NotificationChannelStatSchema),
  by_user: z.array(NotificationUserStatSchema),
})

export const LimitQuerySchema = z.object({
  limit: z.coerce.number().int().positive().default(10),
})

export const ActivityQuerySchema = z.object({
  days: z.coerce.number().int().positive().default(30),
})

export const InstanceContentItemSchema = z.object({
  status: z.string(),
  count: z.number(),
})

export const InstanceContentTypeSchema = z.object({
  content_type: z.string(),
  count: z.number(),
})

export const InstanceBreakdownSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.enum(['sonarr', 'radarr']),
  total_items: z.number(),
  primary_items: z.number(),
  by_status: z.array(InstanceContentItemSchema),
  by_content_type: z.array(InstanceContentTypeSchema),
})

export const InstanceContentBreakdownSchema = z.object({
  success: z.boolean(),
  instances: z.array(InstanceBreakdownSchema),
})

// Combined dashboard stats response schema
export const DashboardStatsSchema = z.object({
  top_genres: z.array(GenreStatSchema),
  most_watched_shows: z.array(ContentStatSchema),
  most_watched_movies: z.array(ContentStatSchema),
  top_users: z.array(UserStatSchema),
  status_distribution: z.array(StatusDistributionSchema),
  content_type_distribution: z.array(ContentTypeDistributionSchema),
  recent_activity: ActivityStatsSchema,
  instance_activity: z.array(InstanceStatSchema),
  availability_times: z.array(AvailabilityTimeSchema),
  grabbed_to_notified_times: z.array(GrabbedToNotifiedTimeSchema),
  status_transitions: z.array(StatusTransitionTimeSchema).optional(),
  status_flow: z.array(StatusFlowDataSchema).optional(),
  notification_stats: NotificationStatsSchema.optional(),
  instance_content_breakdown: z.array(InstanceBreakdownSchema).optional(),
})

// Common error schema
export const ErrorSchema = z.object({
  message: z.string(),
})

// Type exports
export type GenreStat = z.infer<typeof GenreStatSchema>
export type ContentStat = z.infer<typeof ContentStatSchema>
export type UserStat = z.infer<typeof UserStatSchema>
export type StatusDistribution = z.infer<typeof StatusDistributionSchema>
export type ContentTypeDistribution = z.infer<
  typeof ContentTypeDistributionSchema
>
export type NotificationStats = z.infer<typeof NotificationStatsSchema>
export type ActivityStats = z.infer<typeof ActivityStatsSchema>
export type InstanceStat = z.infer<typeof InstanceStatSchema>
export type AvailabilityTime = z.infer<typeof AvailabilityTimeSchema>
export type StatusTransitionTime = z.infer<typeof StatusTransitionTimeSchema>
export type StatusFlowData = z.infer<typeof StatusFlowDataSchema>
export type GrabbedToNotifiedTime = z.infer<typeof GrabbedToNotifiedTimeSchema>
export type DashboardStats = z.infer<typeof DashboardStatsSchema>
export type InstanceContentItem = z.infer<typeof InstanceContentItemSchema>
export type InstanceContentType = z.infer<typeof InstanceContentTypeSchema>
export type InstanceBreakdown = z.infer<typeof InstanceBreakdownSchema>
export type InstanceContentBreakdown = z.infer<
  typeof InstanceContentBreakdownSchema
>
export type Error = z.infer<typeof ErrorSchema>
