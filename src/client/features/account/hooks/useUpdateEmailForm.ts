import { zodResolver } from '@hookform/resolvers/zod'
import { type UpdateEmail, UpdateEmailSchema } from '@root/schemas/auth/users'
import { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { currentUserKeys } from '@/hooks/useCurrentUser'
import { queryClient } from '@/lib/queryClient'
import { apiErrorMessage, apiFetch } from '@/lib/tanstackApi'

interface UseUpdateEmailFormOptions {
  currentEmail: string
}

export function useUpdateEmailForm({
  currentEmail,
}: UseUpdateEmailFormOptions) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle')

  const form = useForm<UpdateEmail>({
    resolver: zodResolver(UpdateEmailSchema),
    mode: 'onChange',
    defaultValues: {
      newEmail: currentEmail,
      currentPassword: '',
    },
  })

  const newEmail = form.watch('newEmail')
  const emailChanged =
    newEmail.trim().toLowerCase() !== currentEmail.trim().toLowerCase()
  const canSubmit = emailChanged && form.formState.isValid

  const onSubmit = useCallback(
    async (data: UpdateEmail) => {
      // Enter submits past the disabled button, so re-check for a real change
      if (
        data.newEmail.trim().toLowerCase() === currentEmail.trim().toLowerCase()
      ) {
        return
      }

      setStatus('loading')

      try {
        const { error } = await apiFetch.PUT('/v1/users/update-email', {
          body: data,
        })

        if (!error) {
          setStatus('success')
          toast.success('Email updated successfully')
          form.reset({ newEmail: data.newEmail, currentPassword: '' })
          await queryClient.invalidateQueries({ queryKey: currentUserKeys.me })
          setTimeout(() => setStatus('idle'), 1000)
        } else {
          setStatus('idle')
          toast.error(apiErrorMessage(error) || 'Failed to update email.')
        }
      } catch (error) {
        console.error('Update email error:', error)
        setStatus('idle')
        toast.error('An unexpected error occurred.')
      }
    },
    [currentEmail, form],
  )

  return {
    form,
    status,
    canSubmit,
    onSubmit,
  }
}
