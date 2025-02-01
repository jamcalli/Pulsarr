import { z } from 'zod'

export const InstanceSchema = z.object({
  id: z.number(),
  name: z.string(),
  baseUrl: z.string(),
  apiKey: z.string(),
  qualityProfile: z.string().optional(),
  rootFolder: z.string().optional(),
  bypassIgnored: z.boolean(),
  seasonMonitoring: z.string(),
  tags: z.array(z.string()),
  isDefault: z.boolean()
})

export const InstancesResponseSchema = z.object({
  success: z.boolean(),
  instances: z.array(InstanceSchema)
})

export const ErrorSchema = z.object({
  message: z.string(),
})

export type InstancesResponse = z.infer<typeof InstancesResponseSchema>