import { z } from 'zod'

export const plexTokenSchema = z.object({
  plexToken: z.string().min(5, { message: 'Plex Token is required' }),
})

export type PlexTokenSchema = z.infer<typeof plexTokenSchema>

export const plexUserSchema = z
  .object({
    name: z.string(),
    email: z.string().email('Invalid email address'),
    alias: z.string().nullable(),
    discord_id: z.string().nullable(),
    notify_email: z.boolean(),
    notify_discord: z.boolean(),
    can_sync: z.boolean(),
  })
  .refine(
    (data) => {
      // Cannot have discord notifications without discord ID
      if (data.notify_discord && !data.discord_id) {
        return false
      }
      // Cannot have email notifications with placeholder email
      if (data.notify_email && data.email.endsWith('@placeholder.com')) {
        return false
      }
      return true
    },
    {
      message: 'Invalid notification settings based on user information',
      path: ['notify_settings'],
    },
  )

export type PlexUserSchema = z.infer<typeof plexUserSchema>

export const bulkUpdateSchema = z.object({
  // Clear fields
  clearAlias: z.boolean().default(false),
  clearDiscordId: z.boolean().default(false),
  clearEmail: z.boolean().default(false),
  // Toggle settings
  setEmailNotify: z.boolean().default(false),
  emailNotifyValue: z.boolean().default(false),
  setDiscordNotify: z.boolean().default(false),
  discordNotifyValue: z.boolean().default(false),
  setCanSync: z.boolean().default(false),
  canSyncValue: z.boolean().default(true),
})
