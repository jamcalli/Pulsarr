import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { LoginErrorMessage } from '@/components/login/login-error'
import { ModeToggle } from '@/components/ui/mode-toggle'
import { Loader2, Check } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card'
import {
  loginFormSchema,
  type LoginFormSchema,
} from '@/components/login/form-schema'
import { toast } from 'sonner'
import { Form, FormField, FormItem, FormMessage } from '@/components/ui/form'
import { FloatingLabelInput } from '@/components/ui/floating-label-input'

export function LoginForm() {
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'success'>(
    'idle',
  )
  const [backendError, setBackendError] = React.useState<string | null>(null)

  const form = useForm<LoginFormSchema>({
    resolver: zodResolver(loginFormSchema),
    mode: 'onChange',
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const onSubmit = async (data: LoginFormSchema) => {
    const { email, password } = data

    setStatus('loading')
    setBackendError(null)

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const responseData = await response.json()

      if (response.ok) {
        setStatus('success')
        toast.success(`Welcome back, ${responseData.username}!`, {
          description: responseData.message,
        })
        // Handle successful login here
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
  }

  return (
    <div className="flex items-center justify-center min-h-screen overflow-hidden">
      <Card className="mx-auto max-w-sm">
        <CardHeader>
          <h1 className="text-2xl font-semibold text-center mb-2">
            Welcome Back
          </h1>
          <CardDescription className="text-center">
            Enter your credentials to login
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FloatingLabelInput
                      {...field}
                      id="username"
                      label="Username"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FloatingLabelInput
                      {...field}
                      id="password"
                      label="Password"
                      type="password"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              {backendError && <LoginErrorMessage message={backendError} />}
              <Button
                type="submit"
                className="w-full h-12"
                disabled={!form.formState.isValid || status !== 'idle'}
              >
                {status === 'loading' ? (
                  <>
                    <Loader2 className="animate-spin mr-2" />
                    Logging in...
                  </>
                ) : status === 'success' ? (
                  <>
                    <Check className="animate-check mr-2" />
                    Success!
                  </>
                ) : (
                  'Login'
                )}
              </Button>
              <div className="flex justify-center">
                <ModeToggle />
              </div>
            </form>
          </Form>
          <footer className="mt-8 text-center text-sm text-muted-foreground">
            &copy; Your Company {new Date().getFullYear()}
          </footer>
        </CardContent>
      </Card>
    </div>
  )
}

export default LoginForm
