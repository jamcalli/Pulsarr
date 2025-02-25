import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Loader2, Check } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card'
import {
  createUserFormSchema,
  type CreateUserFormSchema,
} from '@/pages/create-user/form-schema'
import { CreateUserErrorMessage } from '@/pages/create-user/create-user-error'
import { useToast } from '@/hooks/use-toast'
import {
  Form,
  FormField,
  FormItem,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { ModeToggle } from '@/components/ui/mode-toggle'
import { useNavigate } from 'react-router-dom'

export function CreateUserPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'success'>(
    'idle',
  )
  const [backendError, setBackendError] = React.useState<string | null>(null)
  const emailInputRef = React.useRef<HTMLInputElement>(null)

  // Focus email input on component mount
  React.useEffect(() => {
    if (emailInputRef.current) {
      emailInputRef.current.focus()
    }
  }, [])

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

  const onSubmit = async (data: CreateUserFormSchema) => {
    setStatus('loading')
    setBackendError(null)

    const { confirmPassword, ...submitData } = data

    try {
      const response = await fetch('/v1/users/create-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData),
      })

      const responseData = await response.json()

      if (response.ok) {
        setStatus('success')
        toast({
          description: 'User created successfully!',
          variant: 'default',
        })

        setTimeout(() => {
          navigate('/app/login')
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
  }

  return (
    <div className="w-full max-w-sm px-4">
      <Card className="relative">
        <CardHeader>
          <h1 className="text-2xl font-heading text-center mb-2">
            Create User
          </h1>
          <CardDescription className="text-center">
            Enter details to create a new admin user
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
                    <FormControl>
                      <Input
                        {...field}
                        ref={emailInputRef}
                        type="email"
                        placeholder="Email"
                        autoComplete="email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        {...field}
                        type="text"
                        placeholder="Username"
                        autoComplete="username"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="Password"
                        autoComplete="new-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="Confirm Password"
                        autoComplete="new-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {backendError && (
                <CreateUserErrorMessage message={backendError} />
              )}
              <Button
                type="submit"
                className="w-full h-12 font-heading"
                disabled={!form.formState.isValid || status !== 'idle'}
              >
                {status === 'loading' ? (
                  <>
                    <Loader2 className="animate-spin mr-2" />
                    Creating...
                  </>
                ) : status === 'success' ? (
                  <>
                    <Check className="animate-check mr-2" />
                    Created!
                  </>
                ) : (
                  'Create User'
                )}
              </Button>
            </form>
          </Form>
          <div className="mt-6 text-center">
            <ModeToggle />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default CreateUserPage
