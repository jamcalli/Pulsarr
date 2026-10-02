import { ThemeToggle } from '@/components/theme-toggle'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { LoginForm } from '@/features/auth/components/login-form'

export default function LoginPage() {
  return (
    <div className="w-full max-w-sm px-4">
      <Card>
        <CardHeader>
          <h1 className="font-heading text-xl font-bold">Sign in</h1>
        </CardHeader>
        <CardContent className="gap-6">
          <LoginForm />
          <div className="flex justify-center">
            <ThemeToggle />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
