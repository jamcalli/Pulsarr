import { Page, PageHeaderSkeleton } from '@/components/page-header'
import { SettingsSectionSkeleton } from '@/components/settings/settings-page-skeleton'
import { QuotaCardSkeleton } from '@/features/users/components/quota-card'

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
