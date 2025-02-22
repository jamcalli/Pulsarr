import { z } from 'zod'

export const RadarrMovieSchema = z.object({
  title: z.string(),
  tmdbId: z.number(),
})

export const SonarrEpisodeFileSchema = z.object({
  id: z.number(),
  relativePath: z.string(),
  quality: z.string(),
  qualityVersion: z.number(),
  size: z.number(),
})

export const SonarrEpisodeSchema = z.object({
  episodeNumber: z.number(),
  seasonNumber: z.number(),
  title: z.string(),
  overview: z.string().optional(),
  airDateUtc: z.string(),
})

export const SonarrSeriesSchema = z.object({
  title: z.string(),
  tvdbId: z.number(),
})

export const WebhookTestPayloadSchema = z.object({
  eventType: z.literal('Test'),
  instanceName: z.string(),
})

export const RadarrWebhookPayloadSchema = z.object({
  instanceName: z.literal('Radarr'),
  movie: z.object({
    title: z.string(),
    tmdbId: z.number(),
  }),
})

const BaseSonarrWebhookSchema = z.object({
  eventType: z.literal('Download'),
  instanceName: z.literal('Sonarr'),
  series: SonarrSeriesSchema,
  episodes: z.array(SonarrEpisodeSchema),
  isUpgrade: z.boolean().optional(),
})

export const SonarrWebhookPayloadSchema = z.union([
  BaseSonarrWebhookSchema.extend({
    episodeFile: SonarrEpisodeFileSchema,
  }),

  BaseSonarrWebhookSchema.extend({
    episodeFiles: z.array(SonarrEpisodeFileSchema),
    release: z.object({
      releaseType: z.string(),
    }),
    fileCount: z.number(),
  }),
])

export const WebhookPayloadSchema = z.union([
  WebhookTestPayloadSchema,
  SonarrWebhookPayloadSchema,
  RadarrWebhookPayloadSchema,
])

export const WebhookResponseSchema = z.object({
  success: z.boolean(),
})

export const ErrorSchema = z.object({
  message: z.string(),
})

export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>
export type WebhookResponse = z.infer<typeof WebhookResponseSchema>
export type Error = z.infer<typeof ErrorSchema>
