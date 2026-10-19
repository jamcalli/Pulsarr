import { AuthCard } from '@/features/auth/components/auth-card'
import { LoginForm } from '@/features/auth/components/login-form'

export default function LoginPage() {
  return (
    <AuthCard title="Sign in">
      <LoginForm />
    </AuthCard>
  )
}
