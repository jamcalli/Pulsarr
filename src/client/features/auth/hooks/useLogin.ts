import { useNavigate } from 'react-router-dom'
import { useMinLoadingMutation } from '@/hooks/useMinLoading'
import { NAV_PAGES, pageHref } from '@/lib/navigation'
import { $api, mutationErrorMessage } from '@/lib/tanstackApi'

export function useLogin() {
  const navigate = useNavigate()
  const login = useMinLoadingMutation(
    $api.useMutation('post', '/v1/users/login', {
      onSuccess: ({ redirectTo }) => {
        navigate(redirectTo || pageHref(NAV_PAGES.dashboard))
      },
    }),
  )

  const errorMessage =
    login.isPending || !login.error
      ? null
      : mutationErrorMessage(login.error, 'Login failed. Please try again.')

  return { ...login, errorMessage }
}
