import { z } from 'zod'

const UserBaseSchema = z.object({
  id: z.number(),
  name: z.string(),
  apprise: z.string().nullable(),
  alias: z.string().nullable(),
  discord_id: z.string().nullable(),
  notify_apprise: z.boolean(),
  notify_discord: z.boolean(),
  can_sync: z.boolean(),
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

export const UserErrorSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

export type UserListResponse = z.infer<typeof UserListResponseSchema>
export type UserListWithCountsResponse = z.infer<
  typeof UserListWithCountsResponseSchema
>
export type UserError = z.infer<typeof UserErrorSchema>
