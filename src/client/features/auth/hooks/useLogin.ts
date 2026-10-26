import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useMinLoadingMutation, withMinDuration } from '@/hooks/useMinLoading'
import { NAV_PAGES, pageHref } from '@/lib/navigation'
import { apiFetch, mutationErrorMessage } from '@/lib/tanstackApi'
import type { paths } from '@/types/api.js'

type Credentials =
  paths['/v1/users/login']['post']['requestBody']['content']['application/json']

async function logIn(body: Credentials) {
  const { data, error } = await apiFetch.POST('/v1/users/login', { body })
  if (error) throw error
  return data
}

export function useLogin() {
  const navigate = useNavigate()
  const login = useMinLoadingMutation(
    useMutation({
      mutationFn: (credentials: Credentials) =>
        withMinDuration(logIn(credentials)),
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
