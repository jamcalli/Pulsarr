import { useState } from 'react'
import { Page, PageHeader } from '@/components/page-header'
import { RetryAlert } from '@/components/retry-alert'
import { Button } from '@/components/ui/button'
import { EndpointCredenza } from '@/features/notifications/components/webhooks/endpoint-credenza'
import { EndpointsList } from '@/features/notifications/components/webhooks/endpoints-list'
import { WebhooksSkeleton } from '@/features/notifications/components/webhooks/webhooks-skeleton'
import { useWebhookEndpoints } from '@/features/notifications/hooks/webhooks/useWebhookEndpoints'
import { NAV_PAGES } from '@/lib/navigation'
import type { components } from '@/types/api.js'

type WebhookEndpoint = components['schemas']['WebhookEndpoint']

const SECTION = 'Notifications'
const TITLE = NAV_PAGES.webhooks.label
const DESCRIPTION = 'Send Pulsarr events to your own services as JSON.'

export default function WebhooksPage() {
  const webhooks = useWebhookEndpoints()
  const [editor, setEditor] = useState<{
    open: boolean
    endpoint: WebhookEndpoint | null
  }>({ open: false, endpoint: null })
  const openEditor = (endpoint: WebhookEndpoint | null) =>
    setEditor({ open: true, endpoint })
  const hasEndpoints = (webhooks.endpoints?.length ?? 0) > 0
  const header = (
    <PageHeader
      section={SECTION}
      title={TITLE}
      description={DESCRIPTION}
      action={
        hasEndpoints && (
          <Button type="button" onClick={() => openEditor(null)}>
            Add endpoint
          </Button>
        )
      }
    />
  )

  if (!webhooks.isReady) return <WebhooksSkeleton />

  if (webhooks.errorMessage) {
    return (
      <Page>
        {header}
        <RetryAlert message={webhooks.errorMessage} onRetry={webhooks.retry} />
      </Page>
    )
  }

  if (!webhooks.endpoints) return null

  return (
    <Page>
      {header}
      <EndpointsList
        endpoints={webhooks.endpoints}
        onAdd={() => openEditor(null)}
        onEdit={openEditor}
      />
      <EndpointCredenza
        open={editor.open}
        onOpenChange={(open) => setEditor((prev) => ({ ...prev, open }))}
        endpoint={editor.endpoint}
      />
    </Page>
  )
}
