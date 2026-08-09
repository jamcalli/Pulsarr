import { z } from 'zod'

export const ErrorSchema = z
  .object({
    statusCode: z.number().meta({ description: 'HTTP status code' }),
    error: z.string().meta({ description: 'HTTP status text' }),
    message: z.string().min(1).meta({
      description: 'Error detail, replaced with a generic string for 5xx',
    }),
  })
  .meta({
    id: 'Error',
    description: 'Standard error response',
  })

export type ErrorResponse = z.infer<typeof ErrorSchema>
