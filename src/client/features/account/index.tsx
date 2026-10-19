import { useStore } from '@tanstack/react-form'
import { LeaveDialog } from '@/components/leave-dialog'
import { Page, PageHeader } from '@/components/page-header'
import { RetryAlert } from '@/components/retry-alert'
import { SaveBar } from '@/components/settings/save-bar'
import { SettingsSection } from '@/components/settings/settings-section'
import { AccountSkeleton } from '@/features/account/components/account-skeleton'
import { useAccountForm } from '@/features/account/hooks/useAccountForm'
import {
  type AccountProfile,
  currentPasswordError,
} from '@/features/account/lib/account-form.schema'
import { useBreadcrumbTail } from '@/hooks/useBreadcrumbTail'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useLeaveGuard } from '@/hooks/useLeaveGuard'
import { currentUserKeys } from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import { loadErrorMessage } from '@/lib/tanstackApi'

const SECTION = 'Account'
const TITLE = 'Account settings'
const DESCRIPTION = 'Change the login for this admin account.'

function AccountHeader() {
  return (
    <PageHeader section={SECTION} title={TITLE} description={DESCRIPTION} />
  )
}

function Account({ user }: { user: AccountProfile }) {
  const { form, dirty, saving, saved, errorMessage, discard } =
    useAccountForm(user)
  const guard = useLeaveGuard(dirty)
  const invalid = useStore(form.store, (state) => !state.isValid)
  const passwordError = useStore(form.store, (state) =>
    currentPasswordError(state.values, user),
  )

  return (
    <Page>
      <AccountHeader />
      <form.AppForm>
        <form.Form className="flex flex-col gap-5">
          <SettingsSection
            title="Profile"
            description="The email and username you sign in with."
          >
            <form.AppField name="email">
              {(field) => <field.TextField label="Email" type="email" />}
            </form.AppField>
            <form.AppField name="username">
              {(field) => <field.TextField label="Username" />}
            </form.AppField>
          </SettingsSection>
          <SettingsSection
            title="Password"
            description="Leave both blank to keep your current password."
          >
            <form.AppField name="newPassword">
              {(field) => (
                <field.SecretField
                  label="New password"
                  revealLabel={{
                    show: 'Show new password',
                    hide: 'Hide new password',
                  }}
                />
              )}
            </form.AppField>
            <form.AppField name="confirmPassword">
              {(field) => (
                <field.SecretField
                  label="Confirm new password"
                  revealLabel={{
                    show: 'Show confirmation',
                    hide: 'Hide confirmation',
                  }}
                />
              )}
            </form.AppField>
          </SettingsSection>
          <SettingsSection
            title="Confirm changes"
            description="Your current password is required to save any change above."
          >
            <form.AppField name="currentPassword">
              {(field) => (
                <field.SecretField
                  label="Current password"
                  error={passwordError}
                  revealLabel={{
                    show: 'Show current password',
                    hide: 'Hide current password',
                  }}
                />
              )}
            </form.AppField>
          </SettingsSection>
          <SaveBar
            dirty={dirty}
            isSubmitting={saving}
            saved={saved}
            errorMessage={errorMessage}
            onDiscard={discard}
            saveDisabled={invalid || passwordError !== null}
          />
        </form.Form>
      </form.AppForm>
      <LeaveDialog
        open={guard.blocked}
        onStay={guard.reset}
        onLeave={guard.proceed}
      />
    </Page>
  )
}

export default function AccountPage() {
  useBreadcrumbTail(SECTION)
  const me = useCurrentUser()
  const loadError = loadErrorMessage(me, "Couldn't load your account.")

  if (loadError) {
    return (
      <Page>
        <AccountHeader />
        <RetryAlert
          message={loadError}
          onRetry={() =>
            queryClient.invalidateQueries({ queryKey: currentUserKeys.me })
          }
        />
      </Page>
    )
  }
  if (!me.data) return <AccountSkeleton />
  return <Account user={me.data.user} />
}
