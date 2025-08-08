import { z } from 'zod'
import { ErrorSchema } from '@root/schemas/common/error.schema.js'

export const QuerystringSchema = z.object({
  instanceId: z.string(),
})

export const InstanceInfoSchema = z.object({
  id: z.number(),
  name: z.string(),
  baseUrl: z.string(),
})

export const QualityProfilesResponseSchema = z.object({
  success: z.boolean(),
  instance: InstanceInfoSchema,
  qualityProfiles: z.array(z.any()),
})

export type Querystring = z.infer<typeof QuerystringSchema>
export type InstanceInfo = z.infer<typeof InstanceInfoSchema>
export type QualityProfilesResponse = z.infer<
  typeof QualityProfilesResponseSchema
>
export type GetRadarrQualityProfilesError = z.infer<typeof ErrorSchema>

// Re-export shared schemas
export { ErrorSchema }
