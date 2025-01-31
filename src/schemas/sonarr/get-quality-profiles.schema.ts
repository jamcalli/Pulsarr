import { z } from 'zod'
import type { QualityProfile } from '@root/types/sonarr.types.js'

export const InstanceInfoSchema = z.object({
  id: z.number(),
  name: z.string(),
  baseUrl: z.string(),
})

export const QualityProfilesResponseSchema = z.object({
  success: z.boolean(),
  instance: InstanceInfoSchema,
  qualityProfiles: z.array(z.custom<QualityProfile>()),
})

export const QualityProfilesErrorSchema = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
  code: z.string().optional(),
  instanceId: z.number().optional(),
})

export const ValidationErrorSchema = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
  validation: z.array(
    z.object({
      field: z.string(),
      message: z.string(),
    }),
  ),
})
