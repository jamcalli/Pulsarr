import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

const ApiKeySchema = z.object({
  id: z.number(),
  name: z.string(),
  key: z.string(),
  user_id: z.number(),
  created_at: z.string(),
  is_active: z.boolean(),
})

export const CreateApiKeySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Name is required' })
    .max(100, { error: 'Name must be at most 100 characters' }),
})

export const CreateApiKeyResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  apiKey: ApiKeySchema,
})

export const GetApiKeysResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  apiKeys: z.array(ApiKeySchema),
})

export const RevokeApiKeyParamsSchema = z.object({
  id: z.coerce.number(),
})

export const RevokeApiKeyResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

export type CreateApiKey = z.infer<typeof CreateApiKeySchema>
export type CreateApiKeyResponse = z.infer<typeof CreateApiKeyResponseSchema>
export type GetApiKeysResponse = z.infer<typeof GetApiKeysResponseSchema>
export type RevokeApiKeyParams = z.infer<typeof RevokeApiKeyParamsSchema>
export type RevokeApiKeyResponse = z.infer<typeof RevokeApiKeyResponseSchema>

export { ErrorSchema as ApiKeyErrorSchema }
export type ApiKeyError = z.infer<typeof ErrorSchema>
