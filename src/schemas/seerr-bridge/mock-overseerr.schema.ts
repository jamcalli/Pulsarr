import { z } from 'zod'

// Request schemas
export const GetRequestParamsSchema = z.object({
  request_id: z.string(),
})

export const GetRequestsQuerySchema = z.object({
  take: z.number().optional().default(500),
  filter: z.string().optional().default('approved'),
  sort: z.string().optional().default('added'),
})

export const MarkAvailableParamsSchema = z.object({
  media_id: z.string(),
})

export const MarkAvailableBodySchema = z.object({
  is4k: z.boolean().optional().default(false),
})

// Response schemas
export const RequestDetailsResponseSchema = z.object({
  id: z.number(),
  media: z.object({
    id: z.number(),
    tmdbId: z.number(),
  }),
})

export const RequestsListResponseSchema = z.object({
  results: z.array(
    z.object({
      id: z.number(),
      status: z.number(),
      media: z.object({
        id: z.number(),
        tmdbId: z.number(),
        mediaType: z.string(),
        status: z.number(),
      }),
    }),
  ),
})

export const MediaAvailableResponseSchema = z.object({
  id: z.number(),
  tmdbId: z.number(),
  status: z.string(),
})

export const ErrorResponseSchema = z.object({
  detail: z.string(),
})
