import { z } from 'zod'

export const SuccessMessageResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string().meta({ description: 'Human-readable result message' }),
  })
  .meta({
    id: 'SuccessMessage',
    description: 'Outcome flag with a human-readable message',
  })
