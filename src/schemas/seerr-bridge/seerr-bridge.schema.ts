import { z } from 'zod'

// Schema for incoming completion webhook from SeerrBridge
export const seerrBridgeCompletionSchema = z.object({
  event: z.string(), // e.g., "media.available"
  subject: z.string(), // e.g., "Media Available"
  media: z.object({
    media_type: z.enum(['movie', 'tv']),
    tmdbId: z.number(),
    title: z.string().optional(),
    imdbId: z.string().optional(),
  }),
  request: z.object({
    request_id: z.string(),
  }),
})

// Mock Overseerr API endpoints (for testing)
export const mockOverseerrRequestSchema = z.object({
  request_id: z.number(),
})

export const mockOverseerrMediaAvailableSchema = z.object({
  // Any additional fields for marking media as available
  externalServiceId: z.number().optional(),
  is4k: z.boolean().optional(),
})

// Configuration update schema
export const seerrBridgeConfigSchema = z.object({
  seerrBridgeEnabled: z.boolean().optional(),
  seerrBridgeBaseUrl: z.string().optional(),
  seerrBridgeWebhookUrl: z.string().optional(),
  seerrBridgeApiKey: z.string().optional(),
  seerrBridgeTimeoutMs: z.number().min(1000).max(300000).optional(),
})

export type SeerrBridgeCompletion = z.infer<typeof seerrBridgeCompletionSchema>
export type SeerrBridgeConfig = z.infer<typeof seerrBridgeConfigSchema>
