import { z } from 'zod'

// Common API Key Schema
const ApiKeySchema = z.object({
  id: z.number(),
  name: z.string(),
  key: z.string(),
  created_at: z.string(),
  is_active: z.boolean(),
})

// Create API Key Schema
export const CreateApiKeySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Name is required' })
    .max(100, { error: 'Name must be less than 100 characters' }),
})

export const CreateApiKeyResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  apiKey: ApiKeySchema,
})

// Get API Keys Schema
export const GetApiKeysResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  apiKeys: z.array(ApiKeySchema),
})

// Revoke API Key Schema
export const RevokeApiKeyParamsSchema = z.object({
  id: z.coerce.number(),
})

export const RevokeApiKeyResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

// Error Schema
export const ApiKeyErrorSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

// Exported inferred types
export type CreateApiKey = z.infer<typeof CreateApiKeySchema>
export type CreateApiKeyResponse = z.infer<typeof CreateApiKeyResponseSchema>
export type GetApiKeysResponse = z.infer<typeof GetApiKeysResponseSchema>
export type RevokeApiKeyParams = z.infer<typeof RevokeApiKeyParamsSchema>
export type RevokeApiKeyResponse = z.infer<typeof RevokeApiKeyResponseSchema>
export type ApiKeyError = z.infer<typeof ApiKeyErrorSchema>
