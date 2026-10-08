import { ConfirmCredenza } from '@/components/confirm-credenza'
import { ErrorAlert } from '@/components/error-alert'
import { LeaveDialog } from '@/components/leave-dialog'
import { Page, PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ContentRouterSkeleton } from '@/features/library/components/content-router/content-router-skeleton'
import { RouteList } from '@/features/library/components/content-router/route-list'
import { useContentRouterPage } from '@/features/library/hooks/content-router/useContentRouterPage'
import { ROUTE_TABS } from '@/features/library/lib/content-router/route-list'
import { useShowLoading } from '@/hooks/useMinLoading'
import { formatNumber } from '@/lib/format'

const SECTION = 'Library'
const TITLE = 'Content router'
const DESCRIPTION =
  'Send each request to the right instance based on what it is and who asked for it.'

export default function ContentRouterPage() {
  const page = useContentRouterPage()
  const showLoading = useShowLoading(!page.loaded && !page.loadError)
  const { guard, leaveGuard } = page

  if (page.loadError) {
    return (
      <Page>
        <PageHeader section={SECTION} title={TITLE} description={DESCRIPTION} />
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
  if (showLoading) return <ContentRouterSkeleton />
  if (!page.loaded) return null

  return (
    <Page>
      <PageHeader
        section={SECTION}
        title={TITLE}
        description={DESCRIPTION}
        action={
          <Button
            type="button"
            disabled={!page.targets.hasInstance}
            onClick={() => page.open('new')}
          >
            Add route
          </Button>
        }
      />
      <Tabs
        value={page.type}
        onValueChange={(next) => {
          const tab = ROUTE_TABS.find(({ value }) => value === next)
          if (tab) page.selectType(tab.value)
        }}
        className="gap-5"
      >
        <TabsList aria-label="Content type">
          {ROUTE_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
              <Badge variant="secondary">
                {formatNumber(page.counts[tab.value])}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
        {ROUTE_TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            <RouteList
              type={tab.value}
              routes={page.routes}
              openKey={page.openKey}
              catalog={page.catalog}
              targets={page.targets}
              routeSwitch={page.routeSwitch}
              onOpen={page.open}
              onCollapse={page.collapse}
              onClose={page.close}
              onDelete={page.requestDelete}
              reportDirty={guard.setDirty}
            />
          </TabsContent>
        ))}
      </Tabs>
      <ConfirmCredenza
        open={page.deleting !== null}
        onOpenChange={(open) => {
          if (!open) page.cancelDelete()
        }}
        title="Delete route?"
        description={
          <>
            <b>{page.deleting?.name}</b> is removed and new requests stop
            matching it. Content it already routed stays where it is.
          </>
        }
        confirmLabel="Delete route"
        confirmVariant="destructive"
        pending={page.deletePending}
        pendingLabel="Deleting..."
        errorMessage={page.deleteError}
        onConfirm={page.confirmDelete}
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
