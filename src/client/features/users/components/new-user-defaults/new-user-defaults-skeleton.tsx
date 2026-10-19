import { Page, PageHeaderSkeleton } from '@/components/page-header'
import { QuotaCardSkeleton } from '@/components/quota/quota-card'
import { SettingsSectionSkeleton } from '@/components/settings/settings-page-skeleton'

export function NewUserDefaultsSkeleton() {
  return (
    <Page busy>
      <PageHeaderSkeleton />
      <SettingsSectionSkeleton rows={['switch', 'switch']} />
      <QuotaCardSkeleton description />
      <QuotaCardSkeleton description />
    </Page>
  )
}
