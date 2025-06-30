import { useState, useRef, useCallback, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  loginFormSchema,
  type LoginFormSchema,
} from '@/features/auth/schemas/login-schema'

/**
 * React hook that manages the state, validation, and submission logic for a login form.
 *
 * Provides form validation using a Zod schema, tracks submission status and backend errors, and automatically focuses the email input on mount. On successful login, displays a welcome toast and redirects the user to a dashboard or a specified route.
 *
 * @returns An object containing the form instance, current status, backend error message, email input reference, and the submit handler function.
 */
export function useLoginForm() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle')
  const [backendError, setBackendError] = useState<string | null>(null)
  const emailInputRef = useRef<HTMLInputElement>(null)

  // Add useEffect to focus email input on mount
  useEffect(() => {
    emailInputRef.current?.focus()
  }, [])

  const form = useForm<LoginFormSchema>({
    resolver: zodResolver(loginFormSchema),
    mode: 'onSubmit',
    reValidateMode: 'onBlur',
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const handleSubmit = useCallback(
    async (data: LoginFormSchema) => {
      const { email, password } = data
      setStatus('loading')
      setBackendError(null)
      try {
        const response = await fetch('/v1/users/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })
        const responseData = response.ok
          ? await response.json()
          : await response.json().catch(() => ({
              message: response.statusText || 'Authentication failed',
            }))
        if (response.ok) {
          setStatus('success')
          toast.success(`Welcome back, ${responseData.username}!`)
          setTimeout(() => {
            navigate(responseData.redirectTo || '/dashboard')
          }, 1000)
        } else {
          setStatus('idle')
          setBackendError(
            responseData.message || 'Login failed. Please try again.',
          )
        }
      } catch (error) {
        console.error('Login error:', error)
        setStatus('idle')
        setBackendError('An unexpected error occurred. Please try again.')
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
