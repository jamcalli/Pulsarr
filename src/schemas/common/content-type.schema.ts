import { z } from 'zod'

export const ContentTypeSchema = z.enum(['movie', 'show']).meta({
  id: 'ContentType',
  description: 'Media kind, movie or show',
})

export type ContentType = z.infer<typeof ContentTypeSchema>
