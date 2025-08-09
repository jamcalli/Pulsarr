import { z } from 'zod'
import { ErrorSchema } from '@root/schemas/common/error.schema.js'

export const SyncInstanceResultSchema = z.object({
  itemsCopied: z.number(),
  message: z.string(),
})

export const SyncAllInstancesResultSchema = z.object({
  radarr: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      itemsCopied: z.number(),
    }),
  ),
  sonarr: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      itemsCopied: z.number(),
    }),
  ),
  message: z.string(),
})

export const InstanceIdParamsSchema = z.object({
  instanceId: z.coerce.number().int().positive(),
})

export const InstanceTypeQuerySchema = z.object({
  type: z.enum(['radarr', 'sonarr']),
})

export type SyncError = z.infer<typeof ErrorSchema>

// Re-export shared schemas
export { ErrorSchema }
