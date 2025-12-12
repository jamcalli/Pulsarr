import {
  ErrorSchema,
  NoContentSchema,
} from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

// Base Sonarr instance schema for creation (with defaults)
export const SonarrInstanceSchema = z.object({
  name: z.string().min(1, { error: 'Name is required' }),
  baseUrl: z.string().url({ error: 'Invalid base URL' }),
  apiKey: z.string().min(1, { error: 'API Key is required' }),
  qualityProfile: z.union([z.string(), z.number()]).nullish(),
  rootFolder: z.string().nullish(),
  bypassIgnored: z.boolean().optional().default(false),
  seasonMonitoring: z.string().optional().default('all'),
  monitorNewItems: z.enum(['all', 'none']).default('all'),
  searchOnAdd: z.boolean().optional().default(true),
  createSeasonFolders: z.boolean().optional().default(false),
  tags: z.array(z.string()).optional().default([]),
  isDefault: z.boolean().optional().default(false),
  syncedInstances: z.array(z.number()).optional(),
  seriesType: z
    .enum(['standard', 'anime', 'daily'])
    .optional()
    .default('standard'),
})

// Sonarr instance schema for updates (no defaults to prevent overwriting existing values)
export const SonarrInstanceUpdateSchema = z.object({
  name: z.string().min(1, { error: 'Name is required' }).optional(),
  baseUrl: z.string().url({ error: 'Invalid base URL' }).optional(),
  apiKey: z.string().min(1, { error: 'API Key is required' }).optional(),
  qualityProfile: z.union([z.string(), z.number()]).nullish(),
  rootFolder: z.string().nullish(),
  bypassIgnored: z.boolean().optional(),
  seasonMonitoring: z.string().optional(),
  monitorNewItems: z.enum(['all', 'none']).optional(),
  searchOnAdd: z.boolean().optional(),
  createSeasonFolders: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  isDefault: z.boolean().optional(),
  syncedInstances: z.array(z.number()).optional(),
  seriesType: z.enum(['standard', 'anime', 'daily']).optional(),
})

// Response schema for a single instance (includes id)
export const SonarrInstanceResponseSchema = SonarrInstanceSchema.extend({
  id: z.number(),
})

// Response schema for list of instances
export const SonarrInstanceListResponseSchema = z.array(
  SonarrInstanceResponseSchema,
)

// Response schema for instance creation
export const SonarrInstanceCreateResponseSchema = z.object({
  id: z.number().int().positive(),
})

// Inferred types for use in client and server
export type SonarrInstance = z.infer<typeof SonarrInstanceSchema>
export type SonarrInstanceUpdate = z.infer<typeof SonarrInstanceUpdateSchema>
export type SonarrInstanceResponse = z.infer<
  typeof SonarrInstanceResponseSchema
>
export type SonarrInstanceListResponse = z.infer<
  typeof SonarrInstanceListResponseSchema
>
export type SonarrInstanceCreateResponse = z.infer<
  typeof SonarrInstanceCreateResponseSchema
>

// Re-export shared schemas for route use
export { ErrorSchema, NoContentSchema }
