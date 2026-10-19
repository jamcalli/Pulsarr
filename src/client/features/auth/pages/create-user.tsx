import { AuthCard } from '@/features/auth/components/auth-card'
import { CreateUserForm } from '@/features/auth/components/create-user-form'

export default function CreateUserPage() {
  return (
    <AuthCard
      title="Create the admin account"
      description="One account manages Pulsarr. You can change these details later from Account settings."
    >
      <CreateUserForm />
    </AuthCard>
  )
}
