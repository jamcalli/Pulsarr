import { Page, PageHeaderSkeleton } from '@/components/page-header'
import { ApiKeysCardSkeleton } from '@/features/system/components/api-keys/api-keys-card'
import { CreateKeySectionSkeleton } from '@/features/system/components/api-keys/create-key-section'

export function ApiKeysSkeleton() {
  return (
    <Page busy>
      <PageHeaderSkeleton />
      <CreateKeySectionSkeleton />
      <ApiKeysCardSkeleton />
    </Page>
  )
}
