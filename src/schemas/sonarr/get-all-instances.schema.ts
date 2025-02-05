import { z } from 'zod'

export const InstanceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  baseUrl: z.string().url({ message: 'Invalid base URL' }),
  apiKey: z.string().min(1, { message: 'API Key is required' }),
  qualityProfile: z.string().nullish(),
  rootFolder: z.string().nullish(),
  bypassIgnored: z.boolean().optional().default(false),
  seasonMonitoring: z.string().optional().default('all'),
  tags: z.array(z.string()).optional().default([]),
  isDefault: z.boolean().optional().default(false),
  syncedInstances: z.array(z.number()).optional(),
})

export const InstancesResponseSchema = z.object({
  success: z.boolean(),
  instances: z.array(InstanceSchema),
})

export const ErrorSchema = z.object({
  message: z.string(),
})

export type InstancesResponse = z.infer<typeof InstancesResponseSchema>
