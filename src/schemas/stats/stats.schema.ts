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
})

export const LimitQuerySchema = z.object({
  limit: z.coerce.number().int().positive().default(10),
})

export const ActivityQuerySchema = z.object({
  days: z.coerce.number().int().positive().default(30),
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
export type ActivityStats = z.infer<typeof ActivityStatsSchema>
export type InstanceStat = z.infer<typeof InstanceStatSchema>
export type AvailabilityTime = z.infer<typeof AvailabilityTimeSchema>
export type DashboardStats = z.infer<typeof DashboardStatsSchema>
export type Error = z.infer<typeof ErrorSchema>
