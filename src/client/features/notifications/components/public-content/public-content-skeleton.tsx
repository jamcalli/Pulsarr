import { Page, PageHeaderSkeleton } from '@/components/page-header'
import { SettingsSectionSkeleton } from '@/components/settings/settings-page-skeleton'
import { Skeleton } from '@/components/ui/skeleton'

export function PublicContentSkeleton() {
  return (
    <Page busy>
      <PageHeaderSkeleton />
      <SettingsSectionSkeleton rows={['switch']} description={false} />
      <Skeleton className="h-11 w-56" />
      <SettingsSectionSkeleton rows={['input']} description={false} pill />
      <SettingsSectionSkeleton rows={['input']} description={false} pill />
    </Page>
  )
}
