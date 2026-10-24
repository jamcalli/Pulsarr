import { Page, PageHeaderSkeleton } from '@/components/page-header'
import { SettingsSectionSkeleton } from '@/components/settings/settings-page-skeleton'

export function NewUserDefaultsSkeleton() {
  return (
    <Page busy>
      <PageHeaderSkeleton />
      <SettingsSectionSkeleton rows={['switch', 'switch']} />
      <SettingsSectionSkeleton rows={['switch']} />
      <SettingsSectionSkeleton rows={['switch']} />
    </Page>
  )
}
