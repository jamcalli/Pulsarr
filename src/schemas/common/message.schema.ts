import { z } from 'zod'

export const MessageResponseSchema = z
  .object({
    message: z.string().meta({ description: 'Human-readable result message' }),
  })
  .meta({
    id: 'Message',
    description: 'Standard success message response',
  })

export type MessageResponse = z.infer<typeof MessageResponseSchema>
