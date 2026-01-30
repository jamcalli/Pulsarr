import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

const UserBaseSchema = z.object({
  id: z.number(),
  name: z.string(),
  apprise: z.string().nullable(),
  alias: z.string().nullable(),
  discord_id: z.string().nullable(),
  notify_apprise: z.boolean(),
  notify_discord: z.boolean(),
  notify_discord_mention: z.boolean(),
  notify_tautulli: z.boolean(),
  tautulli_notifier_id: z.number().nullable(),
  can_sync: z.boolean(),
  requires_approval: z.boolean(),
  is_primary_token: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
})

const UserWithCountSchema = UserBaseSchema.extend({
  watchlist_count: z.number(),
})

export const UserListResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  users: z.array(UserBaseSchema),
})

export const UserListWithCountsResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  users: z.array(UserWithCountSchema),
})

export type UserBase = z.infer<typeof UserBaseSchema>
export type UserWithCount = z.infer<typeof UserWithCountSchema>
export type UserListResponse = z.infer<typeof UserListResponseSchema>
export type UserListWithCountsResponse = z.infer<
  typeof UserListWithCountsResponseSchema
>

// Re-export shared error schema with domain-specific alias
export { ErrorSchema as UserErrorSchema }
export type UserError = z.infer<typeof ErrorSchema>
