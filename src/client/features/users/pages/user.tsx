import { UserX } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { InlineLink } from '@/components/inline-link'
import { LeaveDialog } from '@/components/leave-dialog'
import { Page, PageHeader } from '@/components/page-header'
import { RetryAlert } from '@/components/retry-alert'
import { SaveBar } from '@/components/settings/save-bar'
import { UserIdentityCard } from '@/features/users/components/user/user-identity-card'
import { UserPageSkeleton } from '@/features/users/components/user/user-page-skeleton'
import { UserQuotasSection } from '@/features/users/components/user/user-quotas-section'
import { UserSettingsSections } from '@/features/users/components/user/user-settings-sections'
import { UserStatsRow } from '@/features/users/components/user/user-stats-row'
import { UserWatchlistSection } from '@/features/users/components/user/user-watchlist-section'
import { useUserForms } from '@/features/users/hooks/user/useUserForms'
import {
  type UserPageData,
  useUserPage,
} from '@/features/users/hooks/user/useUserPage'
import { useBreadcrumbTail } from '@/hooks/useBreadcrumbTail'
import { useLeaveGuard } from '@/hooks/useLeaveGuard'
import { NAV_PAGES, pageHref } from '@/lib/navigation'
import { displayName } from '@/lib/user-naming'

const SECTION = 'Users'

function UserBody({ data }: { data: UserPageData }) {
  const { user } = data
  const name = displayName(user)
  const forms = useUserForms(data)
  const guard = useLeaveGuard(forms.dirty)
  useBreadcrumbTail(name)

  return (
    <Page>
      <PageHeader
        section={SECTION}
        title={name}
        description={user.alias ? user.name : undefined}
      />
      <UserIdentityCard user={user} name={name} dirty={forms.dirty} />
      <UserStatsRow data={data} />
      <forms.settingsForm.AppForm>
        <forms.settingsForm.Form
          className="flex flex-col gap-5"
          submit={forms.submit}
        >
          <UserSettingsSections
            form={forms.settingsForm}
            username={user.name}
          />
          <UserQuotasSection
            form={forms.quotasForm}
            data={data}
            name={name}
            dirty={forms.dirty}
          />
          <SaveBar
            dirty={forms.dirty}
            isSubmitting={forms.saving}
            saved={forms.saved}
            errorMessage={forms.errorMessage}
            onDiscard={forms.discard}
            saveDisabled={forms.saveBlocked}
            message={forms.blockedMessage}
          />
        </forms.settingsForm.Form>
      </forms.settingsForm.AppForm>
      <UserWatchlistSection items={data.items} />
      <LeaveDialog
        open={guard.blocked}
        onStay={guard.reset}
        onLeave={guard.proceed}
      />
    </Page>
  )
}

function UserNotFound() {
  return (
    <Page>
      <EmptyState
        icon={<UserX />}
        title="User not found"
        description="They may have been removed at the last sync."
      >
        <InlineLink to={pageHref(NAV_PAGES.plexUsers)}>
          {NAV_PAGES.plexUsers.label}
        </InlineLink>
      </EmptyState>
    </Page>
  )
}

export default function UserPage() {
  const page = useUserPage()

  if (!page.isReady) return <UserPageSkeleton />
  if (page.notFound) return <UserNotFound />
  if (page.errorMessage) {
    return (
      <Page>
        <PageHeader section={SECTION} title={NAV_PAGES.plexUsers.label} />
        <RetryAlert message={page.errorMessage} onRetry={page.retry} />
      </Page>
    )
  }
  if (!page.data) return null
  return <UserBody key={page.data.id} data={page.data} />
}
