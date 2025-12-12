import {
  ErrorSchema,
  NoContentSchema,
} from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

// Base Radarr instance schema for creation (with defaults)
export const RadarrInstanceSchema = z.object({
  name: z.string().min(1, { error: 'Name is required' }),
  baseUrl: z.string().url({ error: 'Invalid base URL' }),
  apiKey: z.string().min(1, { error: 'API Key is required' }),
  qualityProfile: z.union([z.string(), z.number()]).nullish(),
  rootFolder: z.string().nullish(),
  bypassIgnored: z.boolean().optional().default(false),
  searchOnAdd: z.boolean().optional().default(true),
  minimumAvailability: z
    .enum(['announced', 'inCinemas', 'released'])
    .optional()
    .default('released'),
  tags: z.array(z.string()).optional().default([]),
  isDefault: z.boolean().optional().default(false),
  syncedInstances: z.array(z.number()).optional(),
})

// Radarr instance schema for updates (no defaults to prevent overwriting existing values)
export const RadarrInstanceUpdateSchema = z.object({
  name: z.string().min(1, { error: 'Name is required' }).optional(),
  baseUrl: z.string().url({ error: 'Invalid base URL' }).optional(),
  apiKey: z.string().min(1, { error: 'API Key is required' }).optional(),
  qualityProfile: z.union([z.string(), z.number()]).nullish(),
  rootFolder: z.string().nullish(),
  bypassIgnored: z.boolean().optional(),
  searchOnAdd: z.boolean().optional(),
  minimumAvailability: z
    .enum(['announced', 'inCinemas', 'released'])
    .optional(),
  tags: z.array(z.string()).optional(),
  isDefault: z.boolean().optional(),
  syncedInstances: z.array(z.number()).optional(),
})

// Response schema for a single instance (includes id)
export const RadarrInstanceResponseSchema = RadarrInstanceSchema.extend({
  id: z.number(),
})

// Response schema for list of instances
export const RadarrInstanceListResponseSchema = z.array(
  RadarrInstanceResponseSchema,
)

// Response schema for instance creation
export const RadarrInstanceCreateResponseSchema = z.object({
  id: z.number().int().positive(),
})

// Inferred types for use in client and server
export type RadarrInstance = z.infer<typeof RadarrInstanceSchema>
export type RadarrInstanceUpdate = z.infer<typeof RadarrInstanceUpdateSchema>
export type RadarrInstanceResponse = z.infer<
  typeof RadarrInstanceResponseSchema
>
export type RadarrInstanceListResponse = z.infer<
  typeof RadarrInstanceListResponseSchema
>
export type RadarrInstanceCreateResponse = z.infer<
  typeof RadarrInstanceCreateResponseSchema
>

// Re-export shared schemas for route use
export { ErrorSchema, NoContentSchema }
