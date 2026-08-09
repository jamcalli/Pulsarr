import { zodResolver } from '@hookform/resolvers/zod'
import { UpdateCredentialsSchema } from '@root/schemas/auth/users'
import { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { apiErrorMessage, apiFetch } from '@/lib/tanstackApi'

const changePasswordFormSchema = UpdateCredentialsSchema.extend({
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

type ChangePasswordForm = z.infer<typeof changePasswordFormSchema>

export function useChangePasswordForm() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle')
  const [backendError, setBackendError] = useState<string | null>(null)

  const form = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordFormSchema),
    mode: 'onChange',
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  })

  const onSubmit = useCallback(
    async (data: ChangePasswordForm) => {
      setStatus('loading')
      setBackendError(null)

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
          setBackendError(apiErrorMessage(error) || 'Failed to update password.')
        }
      } catch (error) {
        console.error('Change password error:', error)
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
    onSubmit,
  }
}
