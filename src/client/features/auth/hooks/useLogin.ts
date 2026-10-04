import { useNavigate } from 'react-router-dom'
import { toast } from '@/components/ui/toast'
import { useMinLoadingMutation } from '@/hooks/useMinLoading'
import { $api, mutationErrorMessage } from '@/lib/tanstackApi'

export function useLogin() {
  const navigate = useNavigate()
  const login = useMinLoadingMutation(
    $api.useMutation('post', '/v1/users/login', {
      onSuccess: ({ username, redirectTo }) => {
        toast.add({ type: 'success', title: `Welcome back, ${username}!` })
        navigate(redirectTo || '/dashboard')
      },
    }),
  )

  const errorMessage =
    login.isPending || !login.error
      ? null
      : mutationErrorMessage(login.error, 'Login failed. Please try again.')

  return { ...login, errorMessage }
}
