import { ConfigUpdateSchema } from '@root/schemas/config/config.schema'

export const DiscordFormSchema = ConfigUpdateSchema.pick({
  discordWebhookUrl: true,
  discordBotToken: true,
  discordClientId: true,
}).required()
