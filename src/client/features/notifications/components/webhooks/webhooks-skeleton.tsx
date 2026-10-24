import { Page, PageHeaderSkeleton } from '@/components/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { EndpointsListSkeleton } from '@/features/notifications/components/webhooks/endpoints-list'

export function WebhooksSkeleton() {
  return (
    <Page busy>
      <PageHeaderSkeleton action={<Skeleton className="h-10 w-32" />} />
      <EndpointsListSkeleton />
    </Page>
  )
}
