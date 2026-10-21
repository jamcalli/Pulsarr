import { useMutation } from '@tanstack/react-query'
import { useMinLoadingMutation, withMinDuration } from '@/hooks/useMinLoading'
import { queryClient } from '@/lib/queryClient'
import { goToLogin } from '@/lib/session-expiry'
import { apiFetch, mutationErrorMessage } from '@/lib/tanstackApi'

async function logOut() {
  const { data, error } = await apiFetch.POST('/v1/users/logout', { body: {} })
  if (error) throw error
  return data
}

/** Leaves the session the same way an expired one does, with the cache dropped and a full page load. */
export function useLogout() {
  const logout = useMinLoadingMutation(
    useMutation({
      mutationFn: () => withMinDuration(logOut()),
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
