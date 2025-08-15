import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const CreateTagBodySchema = z.object({
  instanceId: z.coerce
    .number()
    .int()
    .positive({ error: 'Instance ID is required' }),
  label: z.string().trim().min(1, { error: 'Tag label is required' }),
})

export const CreateTagResponseSchema = z.object({
  id: z.number(),
  label: z.string(),
})

export type CreateTagBody = z.infer<typeof CreateTagBodySchema>
export type CreateTagResponse = z.infer<typeof CreateTagResponseSchema>
export type CreateTagError = z.infer<typeof ErrorSchema>

// Re-export shared schemas
export { ErrorSchema }
