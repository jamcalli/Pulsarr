import { z } from 'zod'

// Shared homepage schema: allow valid URL strings, null, or empty string from TMDB
export const TmdbHomepageSchema = z.union([
  z.string().pipe(z.url({ error: 'Invalid URL format' })),
  z.literal(''),
  z.null(),
])

// Radarr Rating Source Schema
export const RadarrRatingSourceSchema = z.object({
  votes: z.number(),
  value: z.number(),
  type: z.enum(['user', 'critic']),
})

// Radarr Ratings Schema
export const RadarrRatingsSchema = z.object({
  imdb: RadarrRatingSourceSchema.optional(),
  tmdb: RadarrRatingSourceSchema.optional(),
  metacritic: RadarrRatingSourceSchema.optional(),
  rottenTomatoes: RadarrRatingSourceSchema.optional(),
  trakt: RadarrRatingSourceSchema.optional(),
})

// TMDB Genre Schema
export const TmdbGenreSchema = z.object({
  id: z.number(),
  name: z.string(),
})

// TMDB Region Schema
export const TmdbRegionSchema = z.object({
  code: z.string(),
  name: z.string(),
})

// TMDB Production Company Schema
export const TmdbProductionCompanySchema = z.object({
  id: z.number(),
  logo_path: z.string().nullable(),
  name: z.string(),
  origin_country: z.string(),
})

// TMDB Production Country Schema
export const TmdbProductionCountrySchema = z.object({
  iso_3166_1: z.string(),
  name: z.string(),
})

// TMDB Spoken Language Schema
export const TmdbSpokenLanguageSchema = z.object({
  english_name: z.string(),
  iso_639_1: z.string(),
  name: z.string(),
})

// TMDB Collection Schema
export const TmdbBelongsToCollectionSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    poster_path: z.string().nullable(),
    backdrop_path: z.string().nullable(),
  })
  .nullable()

// TMDB Movie Details Schema
export const TmdbMovieDetailsSchema = z.object({
  adult: z.boolean(),
  backdrop_path: z.string().nullable(),
  belongs_to_collection: TmdbBelongsToCollectionSchema.nullable(),
  budget: z.number(),
  genres: z.array(TmdbGenreSchema),
  homepage: TmdbHomepageSchema,
  id: z.number(),
  imdb_id: z.string().nullable(),
  origin_country: z.array(z.string()),
  original_language: z.string(),
  original_title: z.string(),
  overview: z.string().nullable(),
  popularity: z.number(),
  poster_path: z.string().nullable(),
  production_companies: z.array(TmdbProductionCompanySchema),
  production_countries: z.array(TmdbProductionCountrySchema),
  release_date: z.string(),
  revenue: z.number(),
  runtime: z.number().nullable(),
  spoken_languages: z.array(TmdbSpokenLanguageSchema),
  status: z.string(),
  tagline: z.string().nullable(),
  title: z.string(),
  video: z.boolean(),
  vote_average: z.number(),
  vote_count: z.number(),
})

// TMDB Creator Schema
export const TmdbCreatorSchema = z.object({
  id: z.number(),
  credit_id: z.string(),
  name: z.string(),
  original_name: z.string(),
  gender: z.number(),
  profile_path: z.string().nullable(),
})

// TMDB Episode Schema
export const TmdbEpisodeSchema = z.object({
  id: z.number(),
  name: z.string(),
  overview: z.string().nullable(),
  vote_average: z.number(),
  vote_count: z.number(),
  air_date: z.string(),
  episode_number: z.number(),
  episode_type: z.string(),
  production_code: z.string().nullable(),
  runtime: z.number().nullable(),
  season_number: z.number(),
  show_id: z.number(),
  still_path: z.string().nullable(),
})

// TMDB Network Schema
export const TmdbNetworkSchema = z.object({
  id: z.number(),
  logo_path: z.string().nullable(),
  name: z.string(),
  origin_country: z.string(),
})

// TMDB Season Schema
export const TmdbSeasonSchema = z.object({
  air_date: z.string().nullable(),
  episode_count: z.number(),
  id: z.number(),
  name: z.string(),
  overview: z.string().nullable(),
  poster_path: z.string().nullable(),
  season_number: z.number(),
  vote_average: z.number(),
})

// TMDB TV Details Schema
export const TmdbTvDetailsSchema = z.object({
  adult: z.boolean(),
  backdrop_path: z.string().nullable(),
  created_by: z.array(TmdbCreatorSchema),
  episode_run_time: z.array(z.number()),
  first_air_date: z.string().nullable(),
  genres: z.array(TmdbGenreSchema),
  homepage: TmdbHomepageSchema,
  id: z.number(),
  in_production: z.boolean(),
  languages: z.array(z.string()),
  last_air_date: z.string().nullable(),
  last_episode_to_air: TmdbEpisodeSchema.nullable(),
  name: z.string(),
  next_episode_to_air: TmdbEpisodeSchema.nullable(),
  networks: z.array(TmdbNetworkSchema),
  number_of_episodes: z.number(),
  number_of_seasons: z.number(),
  origin_country: z.array(z.string()),
  original_language: z.string(),
  original_name: z.string(),
  overview: z.string().nullable(),
  popularity: z.number(),
  poster_path: z.string().nullable(),
  production_companies: z.array(TmdbProductionCompanySchema),
  production_countries: z.array(TmdbProductionCountrySchema),
  seasons: z.array(TmdbSeasonSchema),
  spoken_languages: z.array(TmdbSpokenLanguageSchema),
  status: z.string(),
  tagline: z.string().nullable(),
  type: z.string(),
  vote_average: z.number(),
  vote_count: z.number(),
})

// TMDB Watch Provider Schema (for API responses)
export const TmdbWatchProviderSchema = z.object({
  display_priority: z.number(),
  logo_path: z.string().nullable(),
  provider_id: z.number(),
  provider_name: z.string(),
})

// TMDB Watch Provider Data Schema (for API responses)
export const TmdbWatchProviderDataSchema = z.object({
  link: z.string().optional(),
  flatrate: z.array(TmdbWatchProviderSchema).optional(),
  rent: z.array(TmdbWatchProviderSchema).optional(),
  buy: z.array(TmdbWatchProviderSchema).optional(),
})

// TMDB Movie Metadata Schema (combined details + watch providers + radarr ratings)
export const TmdbMovieMetadataSchema = z.object({
  details: TmdbMovieDetailsSchema,
  watchProviders: TmdbWatchProviderDataSchema.optional(),
  radarrRatings: RadarrRatingsSchema.optional(),
})

// TMDB TV Metadata Schema (combined details + watch providers)
export const TmdbTvMetadataSchema = z.object({
  details: TmdbTvDetailsSchema,
  watchProviders: TmdbWatchProviderDataSchema.optional(),
})

// Union schema for content metadata
export const TmdbContentMetadataSchema = z.union([
  TmdbMovieMetadataSchema,
  TmdbTvMetadataSchema,
])

// Request schemas
export const GetTmdbMetadataParamsSchema = z.object({
  id: z.string().min(1, { error: 'TMDB ID is required' }),
})

export const GetTmdbMetadataQuerySchema = z.object({
  region: z
    .preprocess(
      (val) => (typeof val === 'string' ? val.toUpperCase() : val),
      z.string().length(2, 'Region must be a 2-letter country code'),
    )
    .optional(),
  type: z.enum(['movie', 'show']).optional(),
})

// Response schemas
export const TmdbMetadataSuccessResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  metadata: TmdbContentMetadataSchema,
})

export const TmdbMetadataErrorResponseSchema = z.object({
  success: z.literal(false),
  message: z.string(),
})

// TMDB Regions Response Schemas
export const TmdbRegionsSuccessResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  regions: z.array(TmdbRegionSchema),
})

export const TmdbRegionsErrorResponseSchema = z.object({
  success: z.literal(false),
  message: z.string(),
})

// Type exports
export type RadarrRatingSource = z.infer<typeof RadarrRatingSourceSchema>
export type RadarrRatings = z.infer<typeof RadarrRatingsSchema>
export type TmdbGenre = z.infer<typeof TmdbGenreSchema>
export type TmdbProductionCompany = z.infer<typeof TmdbProductionCompanySchema>
export type TmdbProductionCountry = z.infer<typeof TmdbProductionCountrySchema>
export type TmdbSpokenLanguage = z.infer<typeof TmdbSpokenLanguageSchema>
export type TmdbBelongsToCollection = z.infer<
  typeof TmdbBelongsToCollectionSchema
>
export type TmdbCreator = z.infer<typeof TmdbCreatorSchema>
export type TmdbEpisode = z.infer<typeof TmdbEpisodeSchema>
export type TmdbNetwork = z.infer<typeof TmdbNetworkSchema>
export type TmdbSeason = z.infer<typeof TmdbSeasonSchema>
export type TmdbMovieDetails = z.infer<typeof TmdbMovieDetailsSchema>
export type TmdbTvDetails = z.infer<typeof TmdbTvDetailsSchema>
export type TmdbWatchProvider = z.infer<typeof TmdbWatchProviderSchema>
export type TmdbWatchProviderData = z.infer<typeof TmdbWatchProviderDataSchema>
export type TmdbMovieMetadata = z.infer<typeof TmdbMovieMetadataSchema>
export type TmdbTvMetadata = z.infer<typeof TmdbTvMetadataSchema>
export type TmdbContentMetadata = z.infer<typeof TmdbContentMetadataSchema>

export type GetTmdbMetadataParams = z.infer<typeof GetTmdbMetadataParamsSchema>
export type GetTmdbMetadataQuery = z.infer<typeof GetTmdbMetadataQuerySchema>
export type TmdbMetadataSuccessResponse = z.infer<
  typeof TmdbMetadataSuccessResponseSchema
>
export type TmdbMetadataErrorResponse = z.infer<
  typeof TmdbMetadataErrorResponseSchema
>
export type TmdbRegion = z.infer<typeof TmdbRegionSchema>
export type TmdbRegionsSuccessResponse = z.infer<
  typeof TmdbRegionsSuccessResponseSchema
>
export type TmdbRegionsErrorResponse = z.infer<
  typeof TmdbRegionsErrorResponseSchema
>
