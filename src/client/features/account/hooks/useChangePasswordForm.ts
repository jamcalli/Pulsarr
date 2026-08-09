import { zodResolver } from '@hookform/resolvers/zod'
import { PasswordSchema } from '@root/schemas/common/auth-fields.schema'
import { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { apiErrorMessage, apiFetch } from '@/lib/tanstackApi'

const changePasswordFormSchema = z
  .object({
    currentPassword: z.string(),
    newPassword: z.string(),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
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

  const currentPassword = form.watch('currentPassword')
  const newPassword = form.watch('newPassword')
  const confirmPassword = form.watch('confirmPassword')
  const canSubmit =
    Boolean(currentPassword.trim()) &&
    newPassword.trim().length >= 8 &&
    Boolean(confirmPassword.trim()) &&
    newPassword === confirmPassword

  const onSubmit = useCallback(
    async (data: ChangePasswordForm) => {
      const currentPasswordResult = PasswordSchema.safeParse(
        data.currentPassword,
      )
      if (!currentPasswordResult.success) {
        form.setError('currentPassword', {
          message:
            currentPasswordResult.error.issues[0]?.message ??
            'Current password is required',
        })
        return
      }

      const newPasswordResult = PasswordSchema.safeParse(data.newPassword)
      if (!newPasswordResult.success) {
        form.setError('newPassword', {
          message:
            newPasswordResult.error.issues[0]?.message ??
            'New password is required',
        })
        return
      }

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
          setBackendError(
            apiErrorMessage(error) || 'Failed to update password.',
          )
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
    canSubmit,
    onSubmit,
  }
}
