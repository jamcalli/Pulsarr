import { Page, PageHeaderSkeleton } from '@/components/page-header'
import { SettingsSectionSkeleton } from '@/components/settings/settings-page-skeleton'
import { QuotaCardSkeleton } from '@/features/users/components/quota-card'

export function NewUserDefaultsSkeleton() {
  return (
    <Page>
      <div aria-busy="true" className="flex flex-col gap-5">
        <PageHeaderSkeleton />
        <SettingsSectionSkeleton rows={['switch', 'switch']} />
        <QuotaCardSkeleton description />
        <QuotaCardSkeleton description />
      </div>
    </Page>
  )
}
