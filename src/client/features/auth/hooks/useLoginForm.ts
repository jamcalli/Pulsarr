import { useState, useRef, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { useToast } from '@/hooks/use-toast'
import {
  loginFormSchema,
  type LoginFormSchema,
} from '@/features/auth/schemas/login-schema'

export function useLoginForm() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle')
  const [backendError, setBackendError] = useState<string | null>(null)
  const emailInputRef = useRef<HTMLInputElement>(null)

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
        const responseData = await response.json()
        if (response.ok) {
          setStatus('success')
          toast({
            description: `Welcome back, ${responseData.username}!`,
            variant: 'default',
          })
          setTimeout(() => {
            navigate(responseData.redirectTo || '/app/dashboard')
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
