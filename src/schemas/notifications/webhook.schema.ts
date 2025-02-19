import { z } from 'zod'

// Base schemas remain the same
export const RadarrMovieSchema = z.object({
  id: z.number(),
  title: z.string(),
  imdbId: z.string().optional(),
  tmdbId: z.number(),
})

export const SonarrEpisodeSchema = z.object({
  episodeNumber: z.number(),
  seasonNumber: z.number(),
  title: z.string(),
  overview: z.string(),
  airDate: z.string(),
  airDateUtc: z.string(),
})

export const SonarrSeriesSchema = z.object({
  id: z.number(),
  title: z.string(),
  tvdbId: z.number(),
  imdbId: z.string().optional(),
})

// Modified test schemas to match actual test payload
export const SonarrTestEpisodeSchema = z.object({
  id: z.number().optional(),
  episodeNumber: z.number(),
  seasonNumber: z.number(),
  title: z.string(),
})

export const SonarrTestSeriesSchema = z.object({
  id: z.number(),
  title: z.string(),
  path: z.string().optional(),
  tvdbId: z.number(),
  tags: z.array(z.string()).optional(),
})

// Regular webhook payloads
export const RadarrWebhookPayloadSchema = z.object({
  instanceName: z.literal('Radarr'),
  movie: RadarrMovieSchema,
})

export const SonarrWebhookPayloadSchema = z.object({
  instanceName: z.literal('Sonarr'),
  series: SonarrSeriesSchema,
  episodes: z.array(SonarrEpisodeSchema),
})

// Test webhook payload
export const WebhookTestPayloadSchema = z.object({
  eventType: z.literal('Test'),
  instanceName: z.string(),
  applicationUrl: z.string().optional(),
  series: SonarrTestSeriesSchema,
  episodes: z.array(SonarrTestEpisodeSchema).optional(),
})

// Combined webhook payload schema
export const WebhookPayloadSchema = z
  .discriminatedUnion('eventType', [WebhookTestPayloadSchema])
  .or(
    z.discriminatedUnion('instanceName', [
      RadarrWebhookPayloadSchema,
      SonarrWebhookPayloadSchema,
    ]),
  )

export const WebhookResponseSchema = z.object({
  success: z.boolean(),
})

export const ErrorSchema = z.object({
  message: z.string(),
})

// Type exports
export type WebhookTestPayload = z.infer<typeof WebhookTestPayloadSchema>
export type RadarrMovie = z.infer<typeof RadarrMovieSchema>
export type SonarrEpisode = z.infer<typeof SonarrEpisodeSchema>
export type SonarrSeries = z.infer<typeof SonarrSeriesSchema>
export type RadarrWebhookPayload = z.infer<typeof RadarrWebhookPayloadSchema>
export type SonarrWebhookPayload = z.infer<typeof SonarrWebhookPayloadSchema>
export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>
export type WebhookResponse = z.infer<typeof WebhookResponseSchema>
export type Error = z.infer<typeof ErrorSchema>
