import { useShowLoading } from '@/hooks/useMinLoading'
import { PageError } from '@/legacy/components/page-error'
import { Separator } from '@/legacy/components/ui/separator'
import { UtilitySectionHeader } from '@/legacy/components/utility-section-header'
import { AccountProfileForm } from '@/legacy/features/account/components/account-profile-form'
import { AccountSettingsPageSkeleton } from '@/legacy/features/account/components/account-settings-page-skeleton'
import { ChangePasswordForm } from '@/legacy/features/account/components/change-password-form'
import { useCurrentUser } from '@/legacy/hooks/useCurrentUser'

export default function AccountSettingsPage() {
  const { currentUser, currentUserLoading } = useCurrentUser()
  const isLoading = useShowLoading(currentUserLoading)

  if (isLoading) {
    return <AccountSettingsPageSkeleton />
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
        <div>
          <h3 className="font-medium text-foreground mb-2">Profile</h3>
          <AccountProfileForm
            currentEmail={currentUser.email}
            currentUsername={currentUser.username}
          />
        </div>

        <Separator />

        <div>
          <h3 className="font-medium text-foreground mb-2">Password</h3>
          <ChangePasswordForm />
        </div>
      </div>
    </div>
  )
}
