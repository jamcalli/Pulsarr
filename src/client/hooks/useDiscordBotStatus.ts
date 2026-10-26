import {
  DISCORD_BOT_STATUSES,
  type DiscordBotStatus,
} from '@root/types/notification.types.js'
import { systemStatusFrom } from '@/lib/system-status'
import { useProgressStore } from '@/stores/progressStore'

export function useDiscordBotStatus(): DiscordBotStatus | null {
  const event = useProgressStore(
    (state) => state.systemStatusCache['discord-status'],
  )
  return systemStatusFrom(event, DISCORD_BOT_STATUSES)
}
