import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const RssFeedsSuccessSchema = z.object({
  self: z.string(),
  friends: z.string(),
})

export const rssFeedsSchema = {
  summary: 'Generate RSS feeds',
  operationId: 'generateRssFeeds',
  description: 'Generate RSS feed URLs for Plex watchlists',
  tags: ['Plex'],
  response: {
    200: RssFeedsSuccessSchema,
    400: ErrorSchema,
    500: ErrorSchema,
  },
}

export type RssFeedsSuccess = z.infer<typeof RssFeedsSuccessSchema>

// Re-export ErrorSchema for domain-specific error type
export { ErrorSchema as RssFeedsErrorSchema }
export type RssFeedsError = z.infer<typeof ErrorSchema>
