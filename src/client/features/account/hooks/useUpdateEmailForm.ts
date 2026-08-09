import { zodResolver } from '@hookform/resolvers/zod'
import { UpdateEmailSchema } from '@root/schemas/auth/users'
import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { currentUserKeys } from '@/hooks/useCurrentUser'
import { queryClient } from '@/lib/queryClient'
import { apiErrorMessage, apiFetch } from '@/lib/tanstackApi'

type UpdateEmailForm = z.infer<typeof UpdateEmailSchema>

export function useUpdateEmailForm(currentEmail: string) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle')
  const [backendError, setBackendError] = useState<string | null>(null)

  const form = useForm<UpdateEmailForm>({
    resolver: zodResolver(UpdateEmailSchema),
    mode: 'onChange',
    defaultValues: {
      newEmail: currentEmail,
      currentPassword: '',
    },
  })

  useEffect(() => {
    form.reset({
      newEmail: currentEmail,
      currentPassword: '',
    })
  }, [currentEmail, form])

  const newEmail = form.watch('newEmail')
  const isUnchanged =
    newEmail.trim().toLowerCase() === currentEmail.trim().toLowerCase()

  const onSubmit = useCallback(
    async (data: UpdateEmailForm) => {
      setStatus('loading')
      setBackendError(null)

      try {
        const { error } = await apiFetch.PUT('/v1/users/update-email', {
          body: data,
        })

        if (!error) {
          setStatus('success')
          toast.success('Email updated successfully')
          form.setValue('currentPassword', '')
          await queryClient.invalidateQueries({ queryKey: currentUserKeys.me })
          setTimeout(() => setStatus('idle'), 1000)
        } else {
          setStatus('idle')
          setBackendError(apiErrorMessage(error) || 'Failed to update email.')
        }
      } catch (error) {
        console.error('Update email error:', error)
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
