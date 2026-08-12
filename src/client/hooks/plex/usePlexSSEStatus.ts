import { useSystemStatus } from '@/hooks/useSystemStatus'

export function usePlexSSEStatus() {
  return useSystemStatus('plex-sse-status')
}
