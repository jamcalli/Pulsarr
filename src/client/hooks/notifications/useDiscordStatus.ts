import { useSystemStatus } from '@/hooks/useSystemStatus'

export function useDiscordStatus() {
  return useSystemStatus('discord-status')
}
