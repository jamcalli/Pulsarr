import * as React from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { LoginErrorMessage } from '@/pages/login/login-error'
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
} from '@/pages/login/form-schema'
import { useToast } from '@/hooks/use-toast'
import { Form, FormField, FormItem, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'

export function LoginPage() {
  const navigate = useNavigate()
  const { toast } = useToast()

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
          navigate('/app/dashboard/plex')
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
  }

  return (
    <div className="w-full max-w-sm px-4">
      <Card className="relative">
        <CardHeader>
          <h1 className="text-2xl font-heading text-center mb-2">
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
                    <Input
                      {...field}
                      type="email"
                      placeholder="Email"
                      autoComplete="email"
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
                    <Input
                      {...field}
                      type="password"
                      placeholder="Password"
                      autoComplete="current-password"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              {backendError && <LoginErrorMessage message={backendError} />}
              <Button
                type="submit"
                className="w-full h-12 font-heading"
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
            </form>
          </Form>
          <div className="mt-6 text-center">
            <ModeToggle />
          </div>
          <footer className="mt-8 text-center text-sm text-muted-foreground">
            &copy; Your Company {new Date().getFullYear()}
          </footer>
        </CardContent>
      </Card>
    </div>
  )
}

export default LoginPage
