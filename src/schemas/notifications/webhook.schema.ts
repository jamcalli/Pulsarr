import { z } from 'zod'

export const RadarrMovieSchema = z
  .object({
    id: z.number().describe('Radarr internal movie ID'),
    title: z.string().describe('Movie title'),
    imdbId: z.string().optional().describe('IMDB ID for the movie'),
    tmdbId: z.number().describe('TMDB ID for the movie'),
  })
  .describe('Movie information from Radarr')

export const SonarrEpisodeSchema = z
  .object({
    episodeNumber: z.number().describe('Episode number'),
    seasonNumber: z.number().describe('Season number'),
    title: z.string().describe('Episode title'),
    overview: z.string().describe('Episode overview/description'),
    airDate: z.string().describe('Original air date'),
    airDateUtc: z.string().describe('Air date in UTC format'),
  })
  .describe('Episode information from Sonarr')

export const SonarrSeriesSchema = z
  .object({
    id: z.number().describe('Sonarr internal series ID'),
    title: z.string().describe('Series title'),
    tvdbId: z.number().describe('TVDB ID for the series'),
    imdbId: z.string().optional().describe('IMDB ID for the series'),
  })
  .describe('Series information from Sonarr')

export const WebhookPayloadSchema = z.discriminatedUnion('instanceName', [
  z
    .object({
      instanceName: z.literal('Radarr').describe('Webhook is from Radarr'),
      movie: RadarrMovieSchema,
    })
    .describe('Radarr movie webhook payload'),
  z
    .object({
      instanceName: z.literal('Sonarr').describe('Webhook is from Sonarr'),
      series: SonarrSeriesSchema,
      episodes: z
        .array(SonarrEpisodeSchema)
        .describe('List of episodes that were processed'),
    })
    .describe('Sonarr series webhook payload'),
])

export const WebhookResponseSchema = z.object({
  success: z
    .boolean()
    .describe('Indicates if the webhook was processed successfully'),
})

export const ErrorSchema = z.object({
  message: z.string().describe('Error message describing what went wrong'),
})

export type RadarrMovie = z.infer<typeof RadarrMovieSchema>
export type SonarrEpisode = z.infer<typeof SonarrEpisodeSchema>
export type SonarrSeries = z.infer<typeof SonarrSeriesSchema>
export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>
export type WebhookResponse = z.infer<typeof WebhookResponseSchema>
export type Error = z.infer<typeof ErrorSchema>
