import { z } from 'zod'
import type { QualityProfile } from '@root/types/sonarr.types.js'

export const QualityProfilesResponseSchema = z.object({
  success: z.boolean(),
  qualityProfiles: z.array(z.custom<QualityProfile>()),
})

export const QualityProfilesErrorSchema = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
})