import { z } from 'zod'
import { ErrorSchema } from '@schemas/common/error.schema.js'

export const CreateTagBodySchema = z.object({
  instanceId: z.number().int().positive('Instance ID is required'),
  label: z.string().min(1, 'Tag label is required'),
})

export const CreateTagResponseSchema = z.object({
  id: z.number(),
  label: z.string(),
})

export type CreateTagBody = z.infer<typeof CreateTagBodySchema>
export type CreateTagResponse = z.infer<typeof CreateTagResponseSchema>
export type Error = z.infer<typeof ErrorSchema>

// Re-export shared schemas
export { ErrorSchema }
