import { zodResolver } from '@hookform/resolvers/zod'
import { UpdateUsernameSchema } from '@root/schemas/auth/users'
import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { currentUserKeys } from '@/hooks/useCurrentUser'
import { queryClient } from '@/lib/queryClient'
import { apiErrorMessage, apiFetch } from '@/lib/tanstackApi'

type UpdateUsernameForm = z.infer<typeof UpdateUsernameSchema>

export function useUpdateUsernameForm(currentUsername: string) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle')
  const [backendError, setBackendError] = useState<string | null>(null)

  const form = useForm<UpdateUsernameForm>({
    resolver: zodResolver(UpdateUsernameSchema),
    mode: 'onChange',
    defaultValues: {
      newUsername: currentUsername,
      currentPassword: '',
    },
  })

  useEffect(() => {
    form.reset({
      newUsername: currentUsername,
      currentPassword: '',
    })
  }, [currentUsername, form])

  const newUsername = form.watch('newUsername')
  const isUnchanged =
    newUsername.trim().toLowerCase() === currentUsername.trim().toLowerCase()

  const onSubmit = useCallback(
    async (data: UpdateUsernameForm) => {
      setStatus('loading')
      setBackendError(null)

      try {
        const { error } = await apiFetch.PUT('/v1/users/update-username', {
          body: data,
        })

        if (!error) {
          setStatus('success')
          toast.success('Username updated successfully')
          form.setValue('currentPassword', '')
          await queryClient.invalidateQueries({ queryKey: currentUserKeys.me })
          setTimeout(() => setStatus('idle'), 1000)
        } else {
          setStatus('idle')
          setBackendError(apiErrorMessage(error) || 'Failed to update username.')
        }
      } catch (error) {
        console.error('Update username error:', error)
        setStatus('idle')
        setBackendError('An unexpected error occurred.')
      }
    },
    [form],
  )

  return {
    form,
    status,
    backendError,
    isUnchanged,
    onSubmit,
  }
}
