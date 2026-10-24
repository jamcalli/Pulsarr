import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useMinLoadingMutation, withMinDuration } from '@/hooks/useMinLoading'
import { apiFetch, mutationErrorMessage } from '@/lib/tanstackApi'
import type { paths } from '@/types/api.js'

type NewAdmin =
  paths['/v1/users/create-admin']['post']['requestBody']['content']['application/json']

async function createAdminUser(body: NewAdmin) {
  const { data, error } = await apiFetch.POST('/v1/users/create-admin', {
    body,
  })
  if (error) throw error
  return data
}

export function useCreateAdmin() {
  const navigate = useNavigate()
  const createAdmin = useMinLoadingMutation(
    useMutation({
      mutationFn: (admin: NewAdmin) => withMinDuration(createAdminUser(admin)),
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
