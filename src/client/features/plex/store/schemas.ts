import { CreateUserSchema } from '@root/schemas/users/users.schema'
import { z } from 'zod'

export const plexTokenSchema = z.object({
  plexToken: z.string().min(5, { error: 'Plex Token is required' }),
})

export type PlexTokenSchema = z.infer<typeof plexTokenSchema>

export const plexUserSchema = CreateUserSchema.refine(
  (data) => {
    // Cannot have discord notifications without discord ID
    if (data.notify_discord && !data.discord_id) {
      return false
    }
    // Cannot have apprise notifications without apprise endpoint
    if (data.notify_apprise && !data.apprise) {
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
  clearApprise: z.boolean().default(false),
  // Toggle settings
  setAppriseNotify: z.boolean().default(false),
  appriseNotifyValue: z.boolean().default(false),
  setDiscordNotify: z.boolean().default(false),
  discordNotifyValue: z.boolean().default(false),
  setTautulliNotify: z.boolean().default(false),
  tautulliNotifyValue: z.boolean().default(false),
  setCanSync: z.boolean().default(false),
  canSyncValue: z.boolean().default(true),
  setRequiresApproval: z.boolean().default(false),
  requiresApprovalValue: z.boolean().default(false),
})
