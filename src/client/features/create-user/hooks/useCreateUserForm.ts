import { zodResolver } from '@hookform/resolvers/zod'
import {
  type CreateAdminForm,
  CreateAdminFormSchema as createAdminFormSchema,
} from '@root/schemas/auth/admin-user'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '@/lib/api'

/**
 * Hook for managing the "create admin user" form: validation, submission, and simple UI state.
 *
 * Uses a Zod schema with react-hook-form, focuses the email input on mount, submits the form (excluding
 * confirmPassword) to the backend endpoint `/v1/users/create-admin`, and navigates to `/login` on success.
 *
 * @returns An object with:
 * - `form` — the react-hook-form instance wired to the admin user schema.
 * - `status` — submission state: `'idle' | 'loading' | 'success'`.
 * - `backendError` — backend error message string or `null`.
 * - `emailInputRef` — ref for the email input element (used to focus on mount).
 * - `onSubmit` — async submit handler to pass to `form.handleSubmit`.
 */
export function useCreateUserForm() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle')
  const [backendError, setBackendError] = useState<string | null>(null)
  const emailInputRef = useRef<HTMLInputElement>(null)

  // Initialize form with zod resolver
  const form = useForm<CreateAdminForm>({
    resolver: zodResolver(createAdminFormSchema),
    mode: 'onChange',
    defaultValues: {
      email: '',
      username: '',
      password: '',
      confirmPassword: '',
    },
  })

  // Focus email input on component mount
  useEffect(() => {
    if (emailInputRef.current) {
      emailInputRef.current.focus()
    }
  }, [])

  const onSubmit = useCallback(
    async (data: CreateAdminForm) => {
      setStatus('loading')
      setBackendError(null)

      const { confirmPassword: _, ...submitData } = data

      try {
        const response = await fetch(api('/v1/users/create-admin'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(submitData),
        })

        const responseData = response.ok
          ? await response.json()
          : await response.json().catch(() => ({
              message: response.statusText || 'Failed to create user',
            }))

        if (response.ok) {
          setStatus('success')
          toast.success('User created successfully!')

          setTimeout(() => {
            navigate('/login')
          }, 1000)
        } else {
          setStatus('idle')
          setBackendError(responseData.message || 'Failed to create user.')
        }
      } catch (error) {
        console.error('Create user error:', error)
        setStatus('idle')
        setBackendError('An unexpected error occurred.')
      }
    },
    [navigate],
  )

  return {
    form,
    status,
    backendError,
    emailInputRef,
    onSubmit,
  }
}
