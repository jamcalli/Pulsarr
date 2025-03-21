import { z } from 'zod'

export const CreateUserSchema = z.object({
  name: z.string().min(3).max(255),
  email: z.string().email().nullable(),
  alias: z.string().min(3).max(255).nullable(),
  discord_id: z.string().nullable(),
  notify_email: z.boolean().default(false),
  notify_discord: z.boolean().default(false),
  can_sync: z.boolean().default(true),
})

export const CreateUserResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  user: z.object({
    id: z.number(),
    name: z.string(),
    email: z.string().nullable(),
    alias: z.string().nullable(),
    discord_id: z.string().nullable(),
    notify_email: z.boolean(),
    notify_discord: z.boolean(),
    can_sync: z.boolean(),
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
    email: z.string().nullable(),
    alias: z.string().nullable(),
    discord_id: z.string().nullable(),
    notify_email: z.boolean(),
    notify_discord: z.boolean(),
    can_sync: z.boolean(),
    created_at: z.string(),
    updated_at: z.string(),
  }),
})

export const UserErrorSchema = z.object({
  success: z.boolean(),
  message: z.string(),
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
export type UserError = z.infer<typeof UserErrorSchema>
export type BulkUpdateRequest = z.infer<typeof BulkUpdateRequestSchema>
export type BulkUpdateResponse = z.infer<typeof BulkUpdateResponseSchema>
