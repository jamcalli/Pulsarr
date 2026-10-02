import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useMinLoadingMutation } from '@/hooks/useMinLoading'
import { $api, apiErrorMessage } from '@/lib/tanstackApi'

export function useLogin() {
  const navigate = useNavigate()
  const login = useMinLoadingMutation(
    $api.useMutation('post', '/v1/users/login', {
      onSuccess: ({ username, redirectTo }) => {
        toast.success(`Welcome back, ${username}!`)
        navigate(redirectTo || '/dashboard')
      },
    }),
  )

  const errorMessage =
    login.isPending || !login.error
      ? null
      : login.error instanceof Error
        ? 'An unexpected error occurred. Please try again.'
        : (apiErrorMessage(login.error) ?? 'Login failed. Please try again.')

  return { ...login, errorMessage }
}
