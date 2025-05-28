import { z } from 'zod'

// Configuration schemas
export const TautulliConfigSchema = z.object({
  url: z.string(),
  apiKey: z.string(),
  enabled: z.boolean(),
})

export const TautulliConfigResponseSchema = z.object({
  url: z.string(),
  apiKey: z.string(),
  enabled: z.boolean(),
})

export const UpdateTautulliConfigSchema = z.object({
  url: z.string().optional(),
  apiKey: z.string().optional(),
  enabled: z.boolean().optional(),
})

// Test connection schema
export const TestConnectionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

// Sync notifiers schema
export const SyncNotifiersResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  syncedUsers: z.number(),
})

// Notification history schemas
export const NotificationHistoryItemSchema = z.object({
  id: z.number(),
  watchlist_item_id: z.number(),
  notifier_id: z.number(),
  success: z.boolean(),
  error_message: z.string().nullable(),
  notified_at: z.string(),
})

export const NotificationHistoryResponseSchema = z.array(
  NotificationHistoryItemSchema,
)

// User notifications schema
export const UpdateUserNotificationsSchema = z.object({
  enabled: z.boolean(),
})

export const UpdateUserNotificationsResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

// Type exports
export type TautulliConfig = z.infer<typeof TautulliConfigSchema>
export type UpdateTautulliConfig = z.infer<typeof UpdateTautulliConfigSchema>
export type TestConnectionResponse = z.infer<
  typeof TestConnectionResponseSchema
>
export type SyncNotifiersResponse = z.infer<typeof SyncNotifiersResponseSchema>
export type NotificationHistoryItem = z.infer<
  typeof NotificationHistoryItemSchema
>
export type UpdateUserNotifications = z.infer<
  typeof UpdateUserNotificationsSchema
>
