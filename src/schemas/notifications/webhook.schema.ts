import { z } from 'zod'

// Simplified RadarrMovieSchema - we only use title and tmdbId
export const RadarrMovieSchema = z.object({
  title: z.string(),
  tmdbId: z.number(),
})

// Simplified SonarrEpisodeSchema - only fields needed for notifications
export const SonarrEpisodeSchema = z.object({
  episodeNumber: z.number(),
  seasonNumber: z.number(),
  title: z.string(),
  overview: z.string().optional(),
  airDateUtc: z.string(),
})

// Simplified SonarrSeriesSchema - only fields we use
export const SonarrSeriesSchema = z.object({
  title: z.string(),
  tvdbId: z.number(),
})

// Test schemas can remain minimal
export const WebhookTestPayloadSchema = z.object({
  eventType: z.literal('Test'),
  instanceName: z.string(),
})

// Regular webhook payloads
export const RadarrWebhookPayloadSchema = z.object({
  instanceName: z.literal('Radarr'),
  movie: z.object({
    title: z.string(),
    tmdbId: z.number(),
  }),
})

export const SonarrWebhookPayloadSchema = z.object({
  eventType: z.literal('Download'),
  instanceName: z.literal('Sonarr'),
  series: SonarrSeriesSchema,
  episodes: z.array(SonarrEpisodeSchema),
})

// Combined webhook payload schema
export const WebhookPayloadSchema = z
  .discriminatedUnion('eventType', [
    WebhookTestPayloadSchema,
    SonarrWebhookPayloadSchema,
  ])
  .or(RadarrWebhookPayloadSchema)

export const WebhookResponseSchema = z.object({
  success: z.boolean(),
})

export const ErrorSchema = z.object({
  message: z.string(),
})

// Type exports
export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>
export type WebhookResponse = z.infer<typeof WebhookResponseSchema>
export type Error = z.infer<typeof ErrorSchema>
