import { z } from 'zod'

// Client form schema for Plex token
export const plexTokenSchema = z.object({
  plexToken: z.string().min(5, { error: 'Plex Token is required' }),
})

export type PlexTokenSchema = z.infer<typeof plexTokenSchema>
