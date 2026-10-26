import { useMinLoading } from '@/hooks/useMinLoading'
import { $api } from '@/lib/tanstackApi'

export function useCurrentUser() {
  return useMinLoading($api.useQuery('get', '/v1/users/me'))
}
