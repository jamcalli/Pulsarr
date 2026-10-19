import { useMinLoadingMutation } from '@/hooks/useMinLoading'
import { queryClient } from '@/lib/queryClient'
import { goToLogin } from '@/lib/session-expiry'
import { $api, mutationErrorMessage } from '@/lib/tanstackApi'

/** Leaves the session the same way an expired one does, with the cache dropped and a full page load. */
export function useLogout() {
  const logout = useMinLoadingMutation(
    $api.useMutation('post', '/v1/users/logout', {
      onSuccess: () => {
        queryClient.clear()
        goToLogin()
      },
    }),
  )

  const errorMessage =
    logout.isPending || !logout.error
      ? null
      : mutationErrorMessage(logout.error, 'Log out failed. Please try again.')

  return { ...logout, errorMessage }
}
