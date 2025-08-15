import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const CreateTagBodySchema = z
  .object({
    instanceId: z
      .number()
      .int({ error: 'Instance ID must be an integer' })
      .positive({ error: 'Instance ID is required' }),
    label: z.string().min(1, { error: 'Tag label is required' }),
  })
  .strict()

export const CreateTagResponseSchema = z.object({
  id: z.number().int().positive(),
  label: z.string().trim(),
})

export type CreateTagBodyInput = z.input<typeof CreateTagBodySchema>
export type CreateTagBody = z.output<typeof CreateTagBodySchema>
export type CreateTagResponse = z.infer<typeof CreateTagResponseSchema>
export type CreateTagError = z.infer<typeof ErrorSchema>

// Re-export shared schemas
export { ErrorSchema }
