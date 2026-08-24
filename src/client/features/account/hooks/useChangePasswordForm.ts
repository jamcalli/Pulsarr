import { zodResolver } from '@hookform/resolvers/zod'
import {
  type UpdateCredentialsForm,
  UpdateCredentialsFormSchema,
} from '@root/schemas/auth/users'
import { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { apiErrorMessage, apiFetch } from '@/lib/tanstackApi'

export function useChangePasswordForm() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle')

  const form = useForm<UpdateCredentialsForm>({
    resolver: zodResolver(UpdateCredentialsFormSchema),
    mode: 'onChange',
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  })

  const canSubmit = form.formState.isValid

  const onSubmit = useCallback(
    async (data: UpdateCredentialsForm) => {
      setStatus('loading')

      const { confirmPassword: _, ...submitData } = data

      try {
        const { error } = await apiFetch.PUT('/v1/users/update-password', {
          body: submitData,
        })

        if (!error) {
          setStatus('success')
          toast.success('Password updated successfully')
          form.reset()
          setTimeout(() => setStatus('idle'), 1000)
        } else {
          setStatus('idle')
          toast.error(apiErrorMessage(error) || 'Failed to update password.')
        }
      } catch (error) {
        console.error('Change password error:', error)
        setStatus('idle')
        toast.error('An unexpected error occurred.')
      }
    },
    [form],
  )

  return {
    form,
    status,
    canSubmit,
    onSubmit,
  }
}
