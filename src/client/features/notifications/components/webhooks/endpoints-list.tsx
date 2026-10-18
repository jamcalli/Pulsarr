import { Webhook } from 'lucide-react'
import { useState } from 'react'
import { BusyLabel } from '@/components/busy-label'
import { CardHeaderSkeleton } from '@/components/card-header-skeleton'
import { CardTitleCount } from '@/components/card-title-count'
import { ConfirmCredenza } from '@/components/confirm-credenza'
import { ConnectionTest } from '@/components/connection-test'
import { DeleteButton } from '@/components/delete-button'
import { EmptyState } from '@/components/empty-state'
import { ExternalLink } from '@/components/external-link'
import {
  SeparatedList,
  SeparatedListActions,
  SeparatedListRow,
} from '@/components/separated-list'
import { InfoLine, InfoLineSkeleton } from '@/components/settings/info-line'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  useDeleteWebhookEndpoint,
  useToggleWebhookEndpoint,
} from '@/features/notifications/hooks/webhooks/useWebhookEndpointMutations'
import {
  deleteEndpointDescription,
  sortEventTypes,
  WEBHOOK_EVENT_LABELS,
  WEBHOOK_PAYLOADS_DOCS_URL,
} from '@/features/notifications/lib/webhooks'
import { useSendTest } from '@/hooks/useSendTest'
import { testWebhookEndpoint } from '@/lib/notification-tests'
import type { components } from '@/types/api.js'

type WebhookEndpoint = components['schemas']['WebhookEndpoint']

const SKELETON_ROWS = ['row-1', 'row-2'] as const
const HEADER_CLASS = 'flex w-full items-start justify-between gap-3'
const TRAILING_CLASS = 'flex shrink-0 items-center gap-2'

function PayloadsInfoLine() {
  return (
    <InfoLine
      action={
        <ExternalLink href={WEBHOOK_PAYLOADS_DOCS_URL}>
          Webhook payloads
        </ExternalLink>
      }
    >
      Each event posts a documented JSON payload, tried up to three times.
    </InfoLine>
  )
}

function EndpointRow({
  endpoint,
  switching,
  switchError,
  onToggle,
  onEdit,
  onDelete,
}: {
  endpoint: WebhookEndpoint
  switching: boolean
  switchError: string | null
  onToggle: (enabled: boolean) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const test = useSendTest(
    () => testWebhookEndpoint(endpoint.id),
    endpoint.updatedAt,
  )

  return (
    <SeparatedListRow>
      <div className={HEADER_CLASS}>
        <ItemContent className="min-w-0">
          <ItemTitle className="break-all">{endpoint.name}</ItemTitle>
          <ItemDescription className="line-clamp-none wrap-anywhere">
            {endpoint.url}
          </ItemDescription>
          {endpoint.authHeaderName && (
            <ItemDescription className="wrap-anywhere">
              Auth header {endpoint.authHeaderName}
            </ItemDescription>
          )}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {sortEventTypes(endpoint.eventTypes).map((type) => (
              <Badge key={type} variant="secondary">
                {WEBHOOK_EVENT_LABELS[type]}
              </Badge>
            ))}
          </div>
        </ItemContent>
        <div className={TRAILING_CLASS}>
          <Switch
            checked={endpoint.enabled}
            disabled={switching}
            aria-label={`${endpoint.name} enabled`}
            onCheckedChange={onToggle}
          />
        </div>
      </div>
      <SeparatedListActions>
        <Button
          type="button"
          variant="neutral"
          size="sm"
          disabled={test.testing}
          onClick={() => test.run(endpoint.updatedAt)}
        >
          <BusyLabel
            busy={test.testing}
            label="Send test"
            busyLabel="Sending..."
          />
        </Button>
        <Button type="button" variant="neutral" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <DeleteButton size="sm" onClick={onDelete}>
          Delete
        </DeleteButton>
      </SeparatedListActions>
      {(test.testing || test.outcome || switchError) && (
        <div className="flex basis-full flex-col gap-2">
          <ConnectionTest
            size="inline"
            testing={test.testing}
            outcome={test.outcome}
          />
          {switchError && (
            <p role="alert" className="text-sm text-destructive-text">
              {switchError}
            </p>
          )}
        </div>
      )}
    </SeparatedListRow>
  )
}

export function EndpointsList({
  endpoints,
  onAdd,
  onEdit,
}: {
  endpoints: WebhookEndpoint[]
  onAdd: () => void
  onEdit: (endpoint: WebhookEndpoint) => void
}) {
  const toggle = useToggleWebhookEndpoint()
  const remove = useDeleteWebhookEndpoint()
  const [confirm, setConfirm] = useState<{
    open: boolean
    endpoint: WebhookEndpoint | null
  }>({ open: false, endpoint: null })

  const content =
    endpoints.length === 0 ? (
      <EmptyState
        icon={<Webhook />}
        title="No endpoints yet"
        description="Add one to send events to Home Assistant, n8n or your own service. Each event posts a documented JSON payload, tried up to three times."
      >
        <Button type="button" onClick={onAdd}>
          Add endpoint
        </Button>
        <ExternalLink href={WEBHOOK_PAYLOADS_DOCS_URL}>
          Webhook payloads
        </ExternalLink>
      </EmptyState>
    ) : (
      <Card>
        <CardHeader>
          <CardTitleCount title="Endpoints" count={endpoints.length} />
        </CardHeader>
        <CardContent>
          <SeparatedList label="Webhook endpoints">
            {endpoints.map((endpoint) => (
              <EndpointRow
                key={endpoint.id}
                endpoint={endpoint}
                switching={toggle.isToggling(endpoint.id)}
                switchError={toggle.errorMessage(endpoint.id)}
                onToggle={(enabled) => void toggle.toggle(endpoint.id, enabled)}
                onEdit={() => onEdit(endpoint)}
                onDelete={() => {
                  remove.reset()
                  setConfirm({ open: true, endpoint })
                }}
              />
            ))}
          </SeparatedList>
          <PayloadsInfoLine />
        </CardContent>
      </Card>
    )

  return (
    <>
      {content}
      <ConfirmCredenza
        open={confirm.open}
        onOpenChange={(open) => setConfirm((prev) => ({ ...prev, open }))}
        title={`Delete ${confirm.endpoint?.name ?? 'endpoint'}?`}
        description={
          confirm.endpoint ? deleteEndpointDescription(confirm.endpoint) : ''
        }
        confirmLabel="Delete endpoint"
        confirmVariant="destructive"
        pending={remove.pending}
        pendingLabel="Deleting..."
        errorMessage={remove.errorMessage}
        onConfirm={() => {
          if (!confirm.endpoint) return
          remove.remove(confirm.endpoint.id, {
            onSuccess: () => setConfirm((prev) => ({ ...prev, open: false })),
          })
        }}
      />
    </>
  )
}

export function EndpointsListSkeleton() {
  return (
    <Card>
      <CardHeaderSkeleton badge />
      <CardContent>
        <SeparatedList>
          {SKELETON_ROWS.map((key) => (
            <SeparatedListRow key={key}>
              <div className={HEADER_CLASS}>
                <ItemContent className="min-w-0">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-4 w-64 max-w-full" />
                  <div className="flex gap-1.5 pt-1">
                    <Skeleton className="h-6 w-28" />
                    <Skeleton className="h-6 w-28" />
                  </div>
                </ItemContent>
                <div className={TRAILING_CLASS}>
                  <Skeleton className="h-6 w-11" />
                </div>
              </div>
              <SeparatedListActions>
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-14" />
                <Skeleton className="h-8 w-20" />
              </SeparatedListActions>
            </SeparatedListRow>
          ))}
        </SeparatedList>
        <InfoLineSkeleton />
      </CardContent>
    </Card>
  )
}
