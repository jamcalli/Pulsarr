import { z } from 'zod'

export const pingSchema = {
  tags: ['Plex'],
  response: {
    200: z.object({
      success: z.boolean(),
    }),
  },
}

export type PingResponse = z.infer<(typeof pingSchema.response)[200]>
