import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card'
import { ModeToggle } from '@/components/ui/mode-toggle'
import { LoginForm } from '@/features/auth/components/login-form'

export function LoginPage() {
  return (
    <div className="w-full max-w-sm px-4">
      <Card className="relative">
        <CardHeader>
          <h1 className="text-2xl font-heading text-center mb-2">Pulsarr</h1>
          <CardDescription className="text-center">
            Enter your credentials to login
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
          <div className="mt-6 text-center">
            <ModeToggle />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default LoginPage
