import { useNavigate } from 'react-router-dom'
import { useMinLoadingMutation } from '@/hooks/useMinLoading'
import { $api, mutationErrorMessage } from '@/lib/tanstackApi'

export function useLogout() {
  const navigate = useNavigate()
  const logout = useMinLoadingMutation(
    $api.useMutation('post', '/v1/users/logout', {
      onSuccess: () => navigate('/login'),
    }),
  )

  const errorMessage =
    logout.isPending || !logout.error
      ? null
      : mutationErrorMessage(logout.error, 'Log out failed. Please try again.')

  return { ...logout, errorMessage }
}
