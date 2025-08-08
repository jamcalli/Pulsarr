import { z } from 'zod'
import { ErrorSchema } from '@root/schemas/common/error.schema.js'

export const RadarrMovieSchema = z.object({
  title: z.string(),
  tmdbId: z.number(),
  tags: z
    .array(z.union([z.number(), z.string().regex(/^\d+$/)]))
    .transform((arr) => arr.map((v) => (typeof v === 'number' ? v : Number(v))))
    .optional(),
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
  tags: z
    .array(z.union([z.number(), z.string().regex(/^\d+$/)]))
    .transform((arr) => arr.map((v) => (typeof v === 'number' ? v : Number(v))))
    .optional(),
})

export const WebhookTestPayloadSchema = z.object({
  eventType: z.literal('Test'),
  instanceName: z.string(),
})

export const WebhookQuerySchema = z.object({
  instanceId: z.string().optional(),
})

export const RadarrWebhookPayloadSchema = z.object({
  instanceName: z.string(),
  movie: RadarrMovieSchema,
})

const BaseSonarrWebhookSchema = z.object({
  eventType: z.literal('Download'),
  instanceName: z.string(),
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

export type WebhookQuery = z.infer<typeof WebhookQuerySchema>
export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>
export type WebhookResponse = z.infer<typeof WebhookResponseSchema>
export type Error = z.infer<typeof ErrorSchema>

// Re-export shared schemas
export { ErrorSchema }
