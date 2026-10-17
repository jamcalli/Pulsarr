import { DiscordFormSchema } from '@/features/notifications/lib/discord-form.schema'
import { useConfigForm } from '@/hooks/useConfigForm'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']

function toConfigValues(config: Config) {
  return {
    discordWebhookUrl: config.discordWebhookUrl ?? '',
    discordBotToken: config.discordBotToken ?? '',
    discordClientId: config.discordClientId ?? '',
  }
}

export function useDiscordForm(config: Config) {
  return useConfigForm({
    config,
    toValues: toConfigValues,
    schema: DiscordFormSchema,
  })
}
