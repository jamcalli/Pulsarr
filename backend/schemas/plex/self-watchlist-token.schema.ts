import { z } from 'zod';

const WatchlistItemSchema = z.object({
  title: z.string(),
  plexKey: z.string(),
  type: z.string(),
  guids: z.array(z.string()),
  genres: z.array(z.string())
});

const SelfWatchlistSuccessSchema = z.object({
  total: z.number(),
  items: z.array(WatchlistItemSchema)
});

const SelfWatchlistErrorSchema = z.object({
  error: z.string()
});

const SelfWatchlistResponseSchema = z.union([
  SelfWatchlistSuccessSchema,
  SelfWatchlistErrorSchema
]);

export const selfWatchlistSchema = {
  tags: ['Plex'],
  response: {
    200: SelfWatchlistResponseSchema
  }
};

export type SelfWatchlistResponse = z.infer<typeof SelfWatchlistResponseSchema>;
export type SelfWatchlistSuccess = z.infer<typeof SelfWatchlistSuccessSchema>;
export type SelfWatchlistError = z.infer<typeof SelfWatchlistErrorSchema>;
export type WatchlistItem = z.infer<typeof WatchlistItemSchema>;