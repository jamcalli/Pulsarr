import { useState, useRef, useCallback, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { useToast } from '@/hooks/use-toast'
import {
  loginFormSchema,
  type LoginFormSchema,
} from '@/features/auth/schemas/login-schema'

/**
 * Provides state management, validation, and submission handling for a login form in a React application.
 *
 * Initializes form validation using a Zod schema, manages form status and backend error messages, and focuses the email input on mount. On successful login, shows a welcome toast and redirects the user to a dashboard or a specified route.
 *
 * @returns An object with the form instance, current status, backend error message, email input ref, and the submit handler function.
 */
export function useLoginForm() {
  const navigate = useNavigate()
  const { toast } = useToast()
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
          toast({
            description: `Welcome back, ${responseData.username}!`,
            variant: 'default',
          })
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
