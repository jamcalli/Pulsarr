import { useSystemStatus } from '@/legacy/hooks/status/useSystemStatus'

export function usePlexSSEStatus() {
  return useSystemStatus('plex-sse-status')
}
