import { useSystemStatus } from '@/legacy/hooks/status/useSystemStatus'

export function useDiscordStatus() {
  return useSystemStatus('discord-status')
}
