import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const CreateUserSchema = z.object({
  name: z.string().min(3).max(255),
  apprise: z.string().nullable(),
  alias: z.string().min(3).max(255).nullable(),
  discord_id: z.string().nullable(),
  notify_apprise: z.boolean().default(false),
  notify_discord: z.boolean().default(false),
  notify_discord_mention: z.boolean().default(true),
  notify_plex_mobile: z.boolean().default(false),
  can_sync: z.boolean().default(true),
  requires_approval: z.boolean().default(false),
})

export const CreateUserResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  user: z.object({
    id: z.number(),
    name: z.string(),
    apprise: z.string().nullable(),
    alias: z.string().nullable(),
    discord_id: z.string().nullable(),
    notify_apprise: z.boolean(),
    notify_discord: z.boolean(),
    notify_discord_mention: z.boolean(),
    notify_plex_mobile: z.boolean(),
    can_sync: z.boolean(),
    requires_approval: z.boolean(),
    plex_uuid: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
    display_name: z.string().nullable().optional(),
    friend_created_at: z.string().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
  }),
})

export const UpdateUserSchema = CreateUserSchema.partial()

export const UpdateUserResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  user: z.object({
    id: z.number(),
    name: z.string(),
    apprise: z.string().nullable(),
    alias: z.string().nullable(),
    discord_id: z.string().nullable(),
    notify_apprise: z.boolean(),
    notify_discord: z.boolean(),
    notify_discord_mention: z.boolean(),
    notify_plex_mobile: z.boolean(),
    can_sync: z.boolean(),
    requires_approval: z.boolean(),
    plex_uuid: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
    display_name: z.string().nullable().optional(),
    friend_created_at: z.string().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
  }),
})

export const BulkUpdateRequestSchema = z.object({
  userIds: z.array(z.number()).min(1),
  updates: UpdateUserSchema,
})

export const BulkUpdateResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  updatedCount: z.number(),
  failedIds: z.array(z.number()).optional(),
})

export type CreateUser = z.infer<typeof CreateUserSchema>
export type CreateUserResponse = z.infer<typeof CreateUserResponseSchema>
export type UpdateUser = z.infer<typeof UpdateUserSchema>
export type UpdateUserResponse = z.infer<typeof UpdateUserResponseSchema>
export type BulkUpdateRequest = z.infer<typeof BulkUpdateRequestSchema>
export type BulkUpdateResponse = z.infer<typeof BulkUpdateResponseSchema>

// Re-export shared error schema with domain-specific alias
export { ErrorSchema as UserErrorSchema }
export type UserError = z.infer<typeof ErrorSchema>
