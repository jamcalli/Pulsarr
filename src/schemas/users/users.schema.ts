import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { UserBaseSchema } from '@root/schemas/users/users-list.schema.js'
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

export const UserResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  user: UserBaseSchema,
})

export const UpdateUserSchema = CreateUserSchema.partial()

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
export type UserResponse = z.infer<typeof UserResponseSchema>
export type UpdateUser = z.infer<typeof UpdateUserSchema>
export type BulkUpdateRequest = z.infer<typeof BulkUpdateRequestSchema>
export type BulkUpdateResponse = z.infer<typeof BulkUpdateResponseSchema>

// Re-export shared error schema with domain-specific alias
export { ErrorSchema as UserErrorSchema }
export type UserError = z.infer<typeof ErrorSchema>
