import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

// Common Exclusion Schema
const ExclusionSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  key: z.string(),
  excluded_at: z.string(),
})

const ExclusionWithUserSchema = ExclusionSchema.extend({
  username: z.string(),
})

// Create Exclusion Schema
export const CreateExclusionSchema = z.object({
  key: z.string().trim().min(1, { error: 'Key is required' }),
  userIds: z
    .array(z.number())
    .min(1, { error: 'At least one user ID is required' }),
})

export const CreateExclusionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  created: z.number(),
})

// Get All Exclusions Schema
export const GetExclusionsResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  exclusions: z.array(ExclusionWithUserSchema),
})

// Get User Exclusions Schema
export const GetUserExclusionsParamsSchema = z.object({
  userId: z.coerce.number(),
})

export const GetUserExclusionsResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  exclusions: z.array(ExclusionSchema),
})

// Remove Exclusion Schema
export const RemoveExclusionParamsSchema = z.object({
  id: z.coerce.number(),
})

export const RemoveExclusionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

// Exported inferred types
export type CreateExclusion = z.infer<typeof CreateExclusionSchema>
export type CreateExclusionResponse = z.infer<
  typeof CreateExclusionResponseSchema
>
export type GetExclusionsResponse = z.infer<typeof GetExclusionsResponseSchema>
export type GetUserExclusionsParams = z.infer<
  typeof GetUserExclusionsParamsSchema
>
export type GetUserExclusionsResponse = z.infer<
  typeof GetUserExclusionsResponseSchema
>
export type RemoveExclusionParams = z.infer<typeof RemoveExclusionParamsSchema>
export type RemoveExclusionResponse = z.infer<
  typeof RemoveExclusionResponseSchema
>

// Re-export shared error schema with domain-specific alias
export { ErrorSchema as ExclusionErrorSchema }
export type ExclusionError = z.infer<typeof ErrorSchema>
