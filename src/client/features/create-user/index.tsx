import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card'
import { ModeToggle } from '@/components/ui/mode-toggle'
import { CreateUserForm } from '@/features/create-user/components/create-user-form'

export function CreateUserPage() {
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
          <CreateUserForm />
          <div className="mt-6 text-center">
            <ModeToggle />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default CreateUserPage
