import { useState, useRef, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  createUserFormSchema,
  type CreateUserFormSchema,
} from '@/features/create-user/schemas/create-user-schema'

/**
 * React hook that manages a user creation form with validation, submission, and error handling.
 *
 * Initializes form state using a Zod schema, tracks submission status, manages backend error messages, and provides a ref to focus the email input on mount. Handles form submission by sending user data to the backend and navigates to the login page upon successful creation.
 *
 * @returns An object containing the form instance, submission status, backend error message, email input ref, and the submit handler function.
 */
export function useCreateUserForm() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle')
  const [backendError, setBackendError] = useState<string | null>(null)
  const emailInputRef = useRef<HTMLInputElement>(null)

  // Initialize form with zod resolver
  const form = useForm<CreateUserFormSchema>({
    resolver: zodResolver(createUserFormSchema),
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

  const handleSubmit = useCallback(
    async (data: CreateUserFormSchema) => {
      setStatus('loading')
      setBackendError(null)

      const { confirmPassword, ...submitData } = data

      try {
        const response = await fetch('/v1/users/create-admin', {
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
    handleSubmit,
  }
}
