import { z } from 'zod';

const RssFeedsSuccessSchema = z.object({
  self: z.string(),
  friends: z.string()
});

const RssFeedsErrorSchema = z.object({
  error: z.string()
});

const RssFeedsResponseSchema = z.union([
  RssFeedsSuccessSchema,
  RssFeedsErrorSchema
]);

export const rssFeedsSchema = {
  tags: ['Plex'],
  response: {
    200: RssFeedsResponseSchema
  }
};

export type RssFeedsResponse = z.infer<typeof RssFeedsResponseSchema>;
export type RssFeedsSuccess = z.infer<typeof RssFeedsSuccessSchema>;
export type RssFeedsError = z.infer<typeof RssFeedsErrorSchema>;