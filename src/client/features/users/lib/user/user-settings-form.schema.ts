import { UpdateUserSchema } from '@root/schemas/users/users.schema'
import { z } from 'zod'

const { shape } = UpdateUserSchema

export const UserSettingsFormSchema = z.object({
  alias: shape.alias.unwrap().unwrap().or(z.literal('')),
  discord_id: shape.discord_id.unwrap().unwrap(),
  apprise: shape.apprise.unwrap().unwrap(),
  notify_discord: shape.notify_discord.unwrap(),
  notify_discord_mention: shape.notify_discord_mention.unwrap(),
  notify_apprise: shape.notify_apprise.unwrap(),
  notify_plex_mobile: shape.notify_plex_mobile.unwrap(),
  can_sync: shape.can_sync.unwrap(),
  requires_approval: shape.requires_approval.unwrap(),
})
