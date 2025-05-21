import { useState, useRef, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { useToast } from '@/hooks/use-toast'
import {
  createUserFormSchema,
  type CreateUserFormSchema,
} from '@/features/create-user/schemas/create-user-schema'

/**
 * React hook that manages the state, validation, and submission logic for a user creation form.
 *
 * Provides form instance, submission status, backend error message, a ref for the email input, and a submit handler.
 *
 * @returns An object with the form instance, current status, backend error message, email input ref, and submit handler.
 */
export function useCreateUserForm() {
  const navigate = useNavigate()
  const { toast } = useToast()
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
          toast({
            description: 'User created successfully!',
            variant: 'default',
          })

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
    [navigate, toast],
  )

  return {
    form,
    status,
    backendError,
    emailInputRef,
    handleSubmit,
  }
}
