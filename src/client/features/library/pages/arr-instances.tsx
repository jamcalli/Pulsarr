import { ErrorAlert } from '@/components/error-alert'
import { LeaveDialog } from '@/components/leave-dialog'
import { Page, PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { ArrInstancesSkeleton } from '@/features/library/components/instances/arr-instances-skeleton'
import { InstancesBody } from '@/features/library/components/instances/instances-body'
import { RemoveInstanceCredenza } from '@/features/library/components/instances/remove-instance-credenza'
import {
  type InstancesPage,
  useInstancesPage,
} from '@/features/library/hooks/instances/useInstancesPage'
import { useWebhookSection } from '@/features/library/hooks/instances/useWebhookAddress'
import { INSTANCE_COPY } from '@/features/library/lib/instances/instance-copy'
import type { ArrType } from '@/features/library/lib/instances/instance-form'
import { useLeaveGuard } from '@/hooks/useLeaveGuard'
import { useShowLoading } from '@/hooks/useMinLoading'
import { NAV_PAGES } from '@/lib/navigation'
import type { components } from '@/types/api.js'

const SECTION = 'Library'

function InstancesSettings({
  page,
  config,
}: {
  page: InstancesPage
  config: components['schemas']['Config']
}) {
  const { type, list, guard } = page
  const webhook = useWebhookSection(config)
  const leaveGuard = useLeaveGuard(guard.dirty || webhook.dirty)

  return (
    <Page>
      <PageHeader
        section={SECTION}
        title={NAV_PAGES[type].label}
        description={INSTANCE_COPY[type].description}
        action={
          !list.isPlaceholderOnly && (
            <Button
              type="button"
              disabled={page.openKey === 'new'}
              onClick={() => page.open('new')}
            >
              Add instance
            </Button>
          )
        }
      />
      <InstancesBody page={page} config={config} webhook={webhook} />
      <RemoveInstanceCredenza
        removing={page.removing}
        instances={list.instances}
        pending={page.removePending}
        errorMessage={page.removeError}
        onCancel={page.cancelRemove}
        onConfirm={page.confirmRemove}
      />
      <LeaveDialog
        open={leaveGuard.blocked || guard.leaveDialog.open}
        onStay={() => {
          leaveGuard.reset()
          guard.leaveDialog.onStay()
        }}
        onLeave={() => {
          if (leaveGuard.blocked) leaveGuard.proceed()
          else guard.leaveDialog.onLeave()
        }}
      />
    </Page>
  )
}

export default function ArrInstancesPage({ type }: { type: ArrType }) {
  const page = useInstancesPage(type)
  const showLoading = useShowLoading(!page.loaded && !page.loadError)

  if (page.loadError) {
    return (
      <Page>
        <PageHeader
          section={SECTION}
          title={NAV_PAGES[type].label}
          description={INSTANCE_COPY[type].description}
        />
        <ErrorAlert message={page.loadError} />
        <Button
          type="button"
          variant="neutral"
          size="sm"
          className="self-start"
          onClick={page.retry}
        >
          Retry
        </Button>
      </Page>
    )
  }
  if (showLoading) return <ArrInstancesSkeleton />
  if (!page.config || !page.loaded) return null
  return <InstancesSettings page={page} config={page.config} />
}
