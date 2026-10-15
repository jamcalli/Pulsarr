import { useStore } from '@tanstack/react-form'
import { LeaveDialog } from '@/components/leave-dialog'
import { Page, PageHeader } from '@/components/page-header'
import { RetryAlert } from '@/components/retry-alert'
import { SaveBar } from '@/components/settings/save-bar'
import { AccountCard } from '@/features/system/components/plex-connection/account-card'
import { LibraryRefreshCard } from '@/features/system/components/plex-connection/library-refresh-card'
import { PlexConnectionSkeleton } from '@/features/system/components/plex-connection/plex-connection-skeleton'
import { ServerCard } from '@/features/system/components/plex-connection/server-card'
import {
  type PlexConnectionPage as ConnectionPage,
  usePlexConnectionPage,
} from '@/features/system/hooks/plex-connection/usePlexConnectionPage'
import { useServerSettings } from '@/features/system/hooks/plex-connection/useServerSettings'
import { linkedToken } from '@/features/system/lib/plex-connection/account-facts'
import { addressError } from '@/features/system/lib/plex-connection/server-form.schema'
import { useLeaveGuard } from '@/hooks/useLeaveGuard'
import { NAV_PAGES } from '@/lib/navigation'
import type { components } from '@/types/api.js'

const SECTION = 'System'
const TITLE = NAV_PAGES.plexConnection.label
const DESCRIPTION =
  'Link your Plex account and server so Pulsarr can read watchlists.'

function PlexConnection({
  page,
  config,
  users,
}: {
  page: ConnectionPage
  config: components['schemas']['Config']
  users: ReadonlyArray<components['schemas']['UserWithCount']>
}) {
  const server = useServerSettings(config)
  const guard = useLeaveGuard(server.dirty)
  const saveError = useStore(server.form.store, (state) =>
    addressError(state.values.server),
  )
  const token = linkedToken(config)

  return (
    <Page>
      <PageHeader section={SECTION} title={TITLE} description={DESCRIPTION} />
      <AccountCard
        config={config}
        users={users}
        hasPlexPass={page.hasPlexPass}
        linked={token !== null}
      />
      <server.form.AppForm>
        <server.form.Form className="flex flex-col gap-5">
          <ServerCard
            form={server.form}
            fields="server"
            linkedToken={token}
            dirty={server.dirty}
            discovery={server.discovery}
            test={server.test}
          />
          <SaveBar
            dirty={server.dirty}
            isSubmitting={server.saving}
            saved={server.saved}
            errorMessage={server.errorMessage}
            onDiscard={server.discard}
            message={saveError ?? undefined}
            saveDisabled={saveError !== null}
          />
        </server.form.Form>
      </server.form.AppForm>
      <LibraryRefreshCard
        configured={page.configured}
        linked={token !== null}
      />
      <LeaveDialog
        open={guard.blocked}
        onStay={guard.reset}
        onLeave={guard.proceed}
      />
    </Page>
  )
}

export default function PlexConnectionPage() {
  const page = usePlexConnectionPage()

  if (!page.isReady) return <PlexConnectionSkeleton />

  if (page.errorMessage || !page.config || !page.users) {
    return (
      <Page>
        <PageHeader section={SECTION} title={TITLE} description={DESCRIPTION} />
        <RetryAlert
          message={page.errorMessage ?? "Couldn't load the Plex connection."}
          onRetry={page.retry}
        />
      </Page>
    )
  }

  return <PlexConnection page={page} config={page.config} users={page.users} />
}
