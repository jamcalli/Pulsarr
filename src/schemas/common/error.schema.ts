import { z } from 'zod'

// Generic error schema - shared across all API endpoints
export const ErrorSchema = z.object({
  message: z.string().min(1),
})
