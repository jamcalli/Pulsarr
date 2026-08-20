import { zodResolver } from '@hookform/resolvers/zod'
import {
  type UpdateUsername,
  UpdateUsernameSchema,
} from '@root/schemas/auth/users'
import { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { currentUserKeys } from '@/hooks/useCurrentUser'
import { queryClient } from '@/lib/queryClient'
import { apiErrorMessage, apiFetch } from '@/lib/tanstackApi'

interface UseUpdateUsernameFormOptions {
  currentUsername: string
}

export function useUpdateUsernameForm({
  currentUsername,
}: UseUpdateUsernameFormOptions) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle')

  const form = useForm<UpdateUsername>({
    resolver: zodResolver(UpdateUsernameSchema),
    mode: 'onChange',
    defaultValues: {
      newUsername: currentUsername,
      currentPassword: '',
    },
  })

  const newUsername = form.watch('newUsername')
  const usernameChanged =
    newUsername.trim().toLowerCase() !== currentUsername.trim().toLowerCase()
  const canSubmit = usernameChanged && form.formState.isValid

  const onSubmit = useCallback(
    async (data: UpdateUsername) => {
      // Enter submits past the disabled button, so re-check for a real change
      if (
        data.newUsername.trim().toLowerCase() ===
        currentUsername.trim().toLowerCase()
      ) {
        return
      }

      setStatus('loading')

      try {
        const { error } = await apiFetch.PUT('/v1/users/update-username', {
          body: data,
        })

        if (!error) {
          setStatus('success')
          toast.success('Username updated successfully')
          form.reset({ newUsername: data.newUsername, currentPassword: '' })
          await queryClient.invalidateQueries({ queryKey: currentUserKeys.me })
          setTimeout(() => setStatus('idle'), 1000)
        } else {
          setStatus('idle')
          toast.error(apiErrorMessage(error) || 'Failed to update username.')
        }
      } catch (error) {
        console.error('Update username error:', error)
        setStatus('idle')
        toast.error('An unexpected error occurred.')
      }
    },
    [currentUsername, form],
  )

  return {
    form,
    status,
    canSubmit,
    onSubmit,
  }
}
