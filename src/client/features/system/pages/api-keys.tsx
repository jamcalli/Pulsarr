import { Page, PageHeader } from '@/components/page-header'
import { RetryAlert } from '@/components/retry-alert'
import { ApiKeysCard } from '@/features/system/components/api-keys/api-keys-card'
import { ApiKeysSkeleton } from '@/features/system/components/api-keys/api-keys-skeleton'
import { CreateKeySection } from '@/features/system/components/api-keys/create-key-section'
import { useApiKeys } from '@/features/system/hooks/api-keys/useApiKeys'
import { NAV_PAGES } from '@/lib/navigation'

const SECTION = 'System'
const TITLE = NAV_PAGES.apiKeys.label
const DESCRIPTION = 'Keys let other apps and scripts call the Pulsarr API.'

export default function ApiKeysPage() {
  const keys = useApiKeys()
  const header = (
    <PageHeader section={SECTION} title={TITLE} description={DESCRIPTION} />
  )

  if (!keys.isReady) return <ApiKeysSkeleton />

  if (keys.errorMessage) {
    return (
      <Page>
        {header}
        <RetryAlert message={keys.errorMessage} onRetry={keys.retry} />
      </Page>
    )
  }

  if (!keys.apiKeys) return null

  return (
    <Page>
      {header}
      <CreateKeySection />
      <ApiKeysCard apiKeys={keys.apiKeys} />
    </Page>
  )
}
