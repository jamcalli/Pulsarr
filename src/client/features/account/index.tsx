import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { PageError } from '@/components/ui/page-error'
import { Separator } from '@/components/ui/separator'
import { UtilitySectionHeader } from '@/components/ui/utility-section-header'
import { AccountProfileForm } from '@/features/account/components/account-profile-form'
import { ChangePasswordForm } from '@/features/account/components/change-password-form'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useShowLoading } from '@/lib/useMinLoading'

export default function AccountSettingsPage() {
  const { currentUser, currentUserLoading } = useCurrentUser()
  const isLoading = useShowLoading(currentUserLoading)

  if (isLoading) {
    return null
  }

  if (!currentUser) {
    return (
      <PageError message="Unable to load account information. Please try again." />
    )
  }

  return (
    <div>
      <UtilitySectionHeader
        title="Account Settings"
        description="Manage your admin login credentials."
        showStatus={false}
      />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              Update your email address or username. Your current password is
              required to confirm changes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AccountProfileForm
              currentEmail={currentUser.email}
              currentUsername={currentUser.username}
            />
          </CardContent>
        </Card>

        <Separator />

        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>
              Choose a new password for your admin account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
