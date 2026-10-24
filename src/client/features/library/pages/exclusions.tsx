import { useStore } from '@tanstack/react-form'
import { ConfigPageGate } from '@/components/config-page-gate'
import { DataTableFooter } from '@/components/data-table/data-table-footer'
import { LeaveDialog } from '@/components/leave-dialog'
import { Page, PageHeader } from '@/components/page-header'
import { RetryAlert } from '@/components/retry-alert'
import { LockLine } from '@/components/settings/lock-line'
import { SaveBar } from '@/components/settings/save-bar'
import { BulkExclusionConfirm } from '@/features/library/components/exclusions/bulk-exclusion-confirm'
import { ExclusionConfirm } from '@/features/library/components/exclusions/exclusion-confirm'
import { ExclusionsBar } from '@/features/library/components/exclusions/exclusions-bar'
import { ExclusionsEmpty } from '@/features/library/components/exclusions/exclusions-empty'
import { ExclusionsFilters } from '@/features/library/components/exclusions/exclusions-filters'
import { ExclusionsSkeleton } from '@/features/library/components/exclusions/exclusions-skeleton'
import { ExclusionsTable } from '@/features/library/components/exclusions/exclusions-table'
import { MaintainerrSection } from '@/features/library/components/exclusions/maintainerr-section'
import {
  type ExclusionsPage as ItemsPage,
  useExclusionsPage,
} from '@/features/library/hooks/exclusions/useExclusionsPage'
import { useMaintainerrForm } from '@/features/library/hooks/exclusions/useMaintainerrForm'
import { useMaintainerrStatus } from '@/features/library/hooks/exclusions/useMaintainerrStatus'
import { useLeaveGuard } from '@/hooks/useLeaveGuard'
import { NAV_PAGES } from '@/lib/navigation'
import type { components } from '@/types/api.js'

const SECTION = 'Library'
const TITLE = NAV_PAGES.exclusions.label
const DESCRIPTION =
  'Block titles from being requested, for one user or for everyone.'
const LOCKED_REASON =
  'Save or discard the Maintainerr changes to edit exclusions.'

function ItemsBody({ page }: { page: ItemsPage }) {
  const { rows } = page
  if (page.errorMessage) {
    return <RetryAlert message={page.errorMessage} onRetry={page.retry} />
  }
  if (rows === null) return null

  const empty = rows.length === 0
  const showToolbar = !empty || page.filtered

  return (
    <div className="flex flex-col gap-5">
      {showToolbar && <ExclusionsFilters page={page} />}
      {page.locked && !empty && <LockLine reason={LOCKED_REASON} />}
      {empty ? (
        <ExclusionsEmpty page={page} />
      ) : (
        <ExclusionsTable page={page} rows={rows} />
      )}
      <DataTableFooter
        page={page.state.page}
        pageSize={page.pageSize}
        onPageSizeChange={page.setPageSize}
        total={empty ? 0 : page.total}
        pageHref={page.pageHref}
        onPageChange={page.setPage}
      />
    </div>
  )
}

function Exclusions({ config }: { config: components['schemas']['Config'] }) {
  const { form, dirty, saving, saved, errorMessage, discard } =
    useMaintainerrForm(config)
  const page = useExclusionsPage(dirty)
  const status = useMaintainerrStatus(config)
  const guard = useLeaveGuard(dirty)
  const invalid = useStore(form.store, (state) => !state.isValid)

  if (!page.isReady) return <ExclusionsSkeleton />

  return (
    <Page wide>
      <PageHeader section={SECTION} title={TITLE} description={DESCRIPTION} />
      <ItemsBody page={page} />
      <form.AppForm>
        <form.Form className="flex flex-col gap-5">
          <MaintainerrSection
            form={form}
            dirty={dirty}
            config={config}
            status={status}
          />
          <SaveBar
            dirty={dirty}
            isSubmitting={saving}
            saved={saved}
            errorMessage={errorMessage}
            onDiscard={discard}
            saveDisabled={invalid}
          />
        </form.Form>
      </form.AppForm>
      <ExclusionsBar page={page} />
      <ExclusionConfirm page={page} />
      <BulkExclusionConfirm page={page} />
      <LeaveDialog
        open={guard.blocked}
        onStay={guard.reset}
        onLeave={guard.proceed}
      />
    </Page>
  )
}

export default function ExclusionsPage() {
  return (
    <ConfigPageGate
      section={SECTION}
      title={TITLE}
      description={DESCRIPTION}
      skeleton={<ExclusionsSkeleton />}
    >
      {(config) => <Exclusions config={config} />}
    </ConfigPageGate>
  )
}
