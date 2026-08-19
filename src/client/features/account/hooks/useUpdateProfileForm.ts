import { zodResolver } from '@hookform/resolvers/zod'
import {
  EmailSchema,
  PasswordSchema,
  UsernameSchema,
} from '@root/schemas/common/auth-fields.schema'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { currentUserKeys } from '@/hooks/useCurrentUser'
import { queryClient } from '@/lib/queryClient'
import { apiErrorMessage, apiFetch } from '@/lib/tanstackApi'

type UpdateProfileForm = {
  email: string
  username: string
  currentPassword: string
}

interface UseUpdateProfileFormOptions {
  currentEmail: string
  currentUsername: string
}

export function useUpdateProfileForm({
  currentEmail,
  currentUsername,
}: UseUpdateProfileFormOptions) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle')
  const [backendError, setBackendError] = useState<string | null>(null)
  const [editingEmail, setEditingEmail] = useState(false)
  const [editingUsername, setEditingUsername] = useState(false)

  const updateProfileFormSchema = useMemo(
    () =>
      z
        .object({
          email: EmailSchema,
          username: UsernameSchema,
          currentPassword: z.string(),
        })
        .superRefine((data, ctx) => {
          const emailChanged =
            data.email.trim().toLowerCase() !==
            currentEmail.trim().toLowerCase()
          const usernameChanged =
            data.username.trim().toLowerCase() !==
            currentUsername.trim().toLowerCase()

          if (!emailChanged && !usernameChanged) {
            return
          }

          const passwordResult = PasswordSchema.safeParse(data.currentPassword)
          if (!passwordResult.success) {
            ctx.addIssue({
              code: 'custom',
              path: ['currentPassword'],
              message:
                passwordResult.error.issues[0]?.message ??
                'Current password is required',
            })
          }
        }),
    [currentEmail, currentUsername],
  )

  const form = useForm<UpdateProfileForm>({
    resolver: zodResolver(updateProfileFormSchema),
    mode: 'onChange',
    defaultValues: {
      email: currentEmail,
      username: currentUsername,
      currentPassword: '',
    },
  })

  useEffect(() => {
    form.reset({
      email: currentEmail,
      username: currentUsername,
      currentPassword: '',
    })
    setEditingEmail(false)
    setEditingUsername(false)
    setBackendError(null)
  }, [currentEmail, currentUsername, form])

  const email = form.watch('email')
  const username = form.watch('username')
  const currentPassword = form.watch('currentPassword')

  const emailChanged =
    email.trim().toLowerCase() !== currentEmail.trim().toLowerCase()
  const usernameChanged =
    username.trim().toLowerCase() !== currentUsername.trim().toLowerCase()
  const hasChanges = emailChanged || usernameChanged

  const canSubmit =
    hasChanges && PasswordSchema.safeParse(currentPassword).success

  const startEditingEmail = useCallback(() => {
    setBackendError(null)
    form.setValue('email', currentEmail)
    setEditingEmail(true)
  }, [currentEmail, form])

  const startEditingUsername = useCallback(() => {
    setBackendError(null)
    form.setValue('username', currentUsername)
    setEditingUsername(true)
  }, [currentUsername, form])

  const cancelEditingEmail = useCallback(() => {
    form.setValue('email', currentEmail)
    if (!usernameChanged) {
      form.setValue('currentPassword', '')
      setBackendError(null)
    }
    setEditingEmail(false)
  }, [currentEmail, form, usernameChanged])

  const cancelEditingUsername = useCallback(() => {
    form.setValue('username', currentUsername)
    if (!emailChanged) {
      form.setValue('currentPassword', '')
      setBackendError(null)
    }
    setEditingUsername(false)
  }, [currentUsername, emailChanged, form])

  const commitEmailDraft = useCallback(
    (value: string) => {
      form.setValue('email', value, { shouldValidate: true })
      setEditingEmail(false)
    },
    [form],
  )

  const commitUsernameDraft = useCallback(
    (value: string) => {
      form.setValue('username', value, { shouldValidate: true })
      setEditingUsername(false)
    },
    [form],
  )

  const stopEditingEmail = useCallback(() => {
    setEditingEmail(false)
  }, [])

  const stopEditingUsername = useCallback(() => {
    setEditingUsername(false)
  }, [])

  const onSubmit = useCallback(
    async (data: UpdateProfileForm) => {
      setStatus('loading')
      setBackendError(null)

      const { currentPassword: password } = data

      try {
        let emailUpdated = false

        if (emailChanged) {
          const { error } = await apiFetch.PUT('/v1/users/update-email', {
            body: { newEmail: data.email, currentPassword: password },
          })

          if (error) {
            setStatus('idle')
            setBackendError(apiErrorMessage(error) || 'Failed to update email.')
            return
          }

          emailUpdated = true
        }

        if (usernameChanged) {
          const { error } = await apiFetch.PUT('/v1/users/update-username', {
            body: { newUsername: data.username, currentPassword: password },
          })

          if (error) {
            setStatus('idle')
            setBackendError(
              apiErrorMessage(error) || 'Failed to update username.',
            )
            if (emailUpdated) {
              setEditingEmail(false)
              toast.success('Email updated successfully')
            }
            await queryClient.invalidateQueries({
              queryKey: currentUserKeys.me,
            })
            return
          }
        }

        setStatus('success')
        if (emailChanged && usernameChanged) {
          toast.success('Profile updated successfully')
        } else if (emailChanged) {
          toast.success('Email updated successfully')
        } else {
          toast.success('Username updated successfully')
        }

        form.setValue('currentPassword', '')
        setEditingEmail(false)
        setEditingUsername(false)
        await queryClient.invalidateQueries({ queryKey: currentUserKeys.me })
        setTimeout(() => setStatus('idle'), 1000)
      } catch (error) {
        console.error('Update profile error:', error)
        setStatus('idle')
        setBackendError('An unexpected error occurred.')
      }
    },
    [currentEmail, currentUsername, emailChanged, usernameChanged, form],
  )

  return {
    form,
    status,
    backendError,
    hasChanges,
    canSubmit,
    editingEmail,
    editingUsername,
    startEditingEmail,
    startEditingUsername,
    cancelEditingEmail,
    cancelEditingUsername,
    commitEmailDraft,
    commitUsernameDraft,
    stopEditingEmail,
    stopEditingUsername,
    onSubmit,
  }
}
