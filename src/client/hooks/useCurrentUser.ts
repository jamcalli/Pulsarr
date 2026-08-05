import { $api } from '@/lib/tanstackApi'

export const currentUserKeys = {
  me: $api.queryOptions('get', '/v1/users/me').queryKey,
}

/**
 * Fetches the authenticated user for the account menu.
 */
export function useCurrentUser() {
  const query = $api.useQuery('get', '/v1/users/me', {}, { staleTime: 5000 })
  return {
    currentUser: query.data?.user ?? null,
    currentUserLoading: query.isLoading,
  }
}
