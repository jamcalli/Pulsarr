import { useSystemStatus } from '@/hooks/status/useSystemStatus'

export function useDiscordStatus() {
  return useSystemStatus('discord-status')
}
