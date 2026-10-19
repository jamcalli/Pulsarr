import { useNavigate } from 'react-router-dom'
import { useMinLoadingMutation } from '@/hooks/useMinLoading'
import { $api, mutationErrorMessage } from '@/lib/tanstackApi'

export function useCreateAdmin() {
  const navigate = useNavigate()
  const createAdmin = useMinLoadingMutation(
    $api.useMutation('post', '/v1/users/create-admin', {
      onSuccess: () => {
        navigate('/login')
      },
    }),
  )

  const errorMessage =
    createAdmin.isPending || !createAdmin.error
      ? null
      : mutationErrorMessage(
          createAdmin.error,
          'The account was not created. Try again.',
        )

  return { ...createAdmin, errorMessage }
}
