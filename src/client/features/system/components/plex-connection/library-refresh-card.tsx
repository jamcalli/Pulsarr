import { Server } from 'lucide-react'
import { BusyLabel } from '@/components/busy-label'
import { ConfirmCredenza } from '@/components/confirm-credenza'
import { EmptyState } from '@/components/empty-state'
import { ErrorAlert } from '@/components/error-alert'
import { NavPageButton } from '@/components/nav-page-button'
import { ActionResults } from '@/components/settings/action-results'
import { ActionRow } from '@/components/settings/action-row'
import {
  ArrInstanceResultsSkeleton,
  ArrInstanceResultsTable,
} from '@/components/settings/arr-instance-results'
import {
  FieldRowSkeleton,
  SettingsSectionSkeleton,
} from '@/components/settings/settings-page-skeleton'
import { SettingsSection } from '@/components/settings/settings-section'
import { Button } from '@/components/ui/button'
import { useLibraryRefresh } from '@/features/system/hooks/plex-connection/useLibraryRefresh'
import {
  REFRESH_PILLS,
  type RefreshRow,
} from '@/features/system/lib/plex-connection/library-refresh'
import { formatCount, formatNumber } from '@/lib/format'
import { NAV_PAGES } from '@/lib/navigation'
import { LINK_FIRST_REASON } from '@/lib/plex/account-facts'

const TITLE = 'Plex library refresh'
const DESCRIPTION =
  'Sonarr and Radarr tell Plex to refresh after they import something.'
const SKELETON_ROWS = ['row-1', 'row-2', 'row-3'] as const

function NoInstances() {
  return (
    <EmptyState
      icon={<Server />}
      title="No Sonarr or Radarr instances yet"
      description="Add one, then come back to set up library refresh."
    >
      <div className="flex flex-wrap justify-center gap-2">
        {[NAV_PAGES.sonarr, NAV_PAGES.radarr].map((navPage) => (
          <NavPageButton key={navPage.to} page={navPage} />
        ))}
      </div>
    </EmptyState>
  )
}

const STATUS_LABEL = 'Status'

function RefreshTableSkeleton() {
  return (
    <ArrInstanceResultsSkeleton
      rows={SKELETON_ROWS}
      statusLabel={STATUS_LABEL}
    />
  )
}

export function LibraryRefreshCard({
  configured,
  linked,
}: {
  configured: { radarr: Set<number>; sonarr: Set<number> }
  linked: boolean
}) {
  const refresh = useLibraryRefresh(configured)
  const lock = linked ? undefined : { reason: LINK_FIRST_REASON }

  if (!refresh.hasInstances) {
    return (
      <SettingsSection title={TITLE} description={DESCRIPTION} lock={lock}>
        <NoInstances />
      </SettingsSection>
    )
  }

  const rows: RefreshRow[] | null = refresh.rows
  const names = refresh.setUpNames
  const table = rows ? (
    <ArrInstanceResultsTable
      rows={rows.map((row) => ({ ...row, pill: REFRESH_PILLS[row.state] }))}
      caption="Library refresh by instance"
      statusLabel={STATUS_LABEL}
    />
  ) : refresh.statusError ? null : (
    <RefreshTableSkeleton />
  )

  return (
    <>
      <SettingsSection title={TITLE} description={DESCRIPTION} lock={lock}>
        <ActionRow
          title="Every Sonarr and Radarr instance"
          description="Add or remove the Plex connection on all of them."
          running={refresh.running}
          errorMessage={refresh.errorMessage}
          actions={
            <>
              <Button
                type="button"
                size="sm"
                disabled={!linked || refresh.running}
                onClick={refresh.setUp}
              >
                <BusyLabel
                  busy={refresh.setupRunning}
                  label="Set up"
                  busyLabel="Setting up..."
                />
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={!linked || names.length === 0 || refresh.running}
                onClick={() => refresh.setConfirmOpen(true)}
              >
                <BusyLabel
                  busy={refresh.removeRunning}
                  label="Remove"
                  busyLabel="Removing..."
                />
              </Button>
            </>
          }
        />
        <div className="flex flex-col gap-3">
          {refresh.ranAt !== null && rows && (
            <ActionResults ranAt={refresh.ranAt}>
              <p className="text-xs">
                {`${formatNumber(names.length)} of ${formatCount(rows.length, 'instance')} set up.`}
              </p>
            </ActionResults>
          )}
          <ErrorAlert message={refresh.statusError} />
          {table}
        </div>
      </SettingsSection>
      <ConfirmCredenza
        open={refresh.confirmOpen}
        onOpenChange={refresh.setConfirmOpen}
        title={`Remove library refresh from ${formatCount(names.length, 'instance')}`}
        description="Each loses its Plex Media Server connection, including ones added by hand."
        confirmLabel={`Remove from ${formatCount(names.length, 'instance')}`}
        confirmVariant="destructive"
        onConfirm={refresh.remove}
      >
        <ul className="list-disc pl-5 text-sm">
          {names.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </ConfirmCredenza>
    </>
  )
}

export function LibraryRefreshCardSkeleton() {
  return (
    <SettingsSectionSkeleton>
      <FieldRowSkeleton control="field" />
      <RefreshTableSkeleton />
    </SettingsSectionSkeleton>
  )
}
