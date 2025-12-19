import { Webhook } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { WebhookEndpointCard } from '@/features/notifications/components/webhooks/webhook-endpoint-card'
import { WebhookEndpointDeleteModal } from '@/features/notifications/components/webhooks/webhook-endpoint-delete-modal'
import { WebhookEndpointModal } from '@/features/notifications/components/webhooks/webhook-endpoint-modal'
import { useWebhookEndpoints } from '@/features/notifications/hooks/useWebhookEndpoints'

interface WebhookEndpointsSectionProps {
  isInitialized: boolean
}

function WebhookEndpointsSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2].map((i) => (
        <div key={i} className="p-4 border-2 border-border rounded-md bg-card">
          <div className="flex justify-between items-center mb-3">
            <Skeleton className="h-5 w-32" />
            <div className="flex gap-2">
              <Skeleton className="h-10 w-10" />
              <Skeleton className="h-10 w-10" />
            </div>
          </div>
          <Skeleton className="h-10 w-full mb-3" />
          <div className="flex gap-1">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-6 w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function WebhookEndpointsSection({
  isInitialized,
}: WebhookEndpointsSectionProps) {
  const {
    endpoints,
    hasLoaded,
    loading,
    fetchEndpoints,
    form,
    connectionTested,
    saveStatus,
    editingEndpoint,
    isModalOpen,
    deleteEndpointId,
    openCreateModal,
    openEditModal,
    closeModal,
    handleTest,
    handleSubmit,
    handleDelete,
    openDeleteModal,
    closeDeleteModal,
  } = useWebhookEndpoints()

  useEffect(() => {
    if (isInitialized && !hasLoaded) {
      void fetchEndpoints()
    }
  }, [isInitialized, hasLoaded, fetchEndpoints])

  const endpointToDelete = endpoints.find((ep) => ep.id === deleteEndpointId)

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="text-sm text-foreground p-3 bg-secondary-background rounded-base border-2 border-border">
        <p>
          Configure webhook endpoints to receive notifications for Pulsarr
          events. Webhooks send JSON payloads to your specified URLs when events
          occur.
        </p>
      </div>

      {/* Add New Webhook */}
      <div>
        <h3 className="font-medium text-sm text-foreground mb-2">
          Add New Webhook
        </h3>
        <Button
          onClick={openCreateModal}
          variant="blue"
          className="flex items-center gap-2"
        >
          <Webhook className="h-4 w-4" />
          Add Webhook Endpoint
        </Button>
      </div>

      {/* Separator */}
      {endpoints.length > 0 && <Separator />}

      {/* Existing Webhooks */}
      {loading.fetch && !hasLoaded ? (
        <WebhookEndpointsSkeleton />
      ) : endpoints.length > 0 ? (
        <div>
          <h3 className="font-medium text-sm text-foreground mb-2">
            Existing Webhooks ({endpoints.length})
          </h3>
          <div className="space-y-3">
            {endpoints.map((endpoint) => (
              <WebhookEndpointCard
                key={endpoint.id}
                endpoint={endpoint}
                onEdit={() => openEditModal(endpoint)}
                onDelete={() => openDeleteModal(endpoint.id)}
                isDeleting={loading.delete[endpoint.id]}
              />
            ))}
          </div>
        </div>
      ) : hasLoaded ? (
        <div className="text-center py-8 text-foreground">
          <Webhook className="h-8 w-8 mx-auto mb-2 opacity-50 text-foreground" />
          <p>No webhook endpoints created yet</p>
          <p className="text-sm">
            Create your first webhook endpoint above to get started
          </p>
        </div>
      ) : null}

      {/* Create/Edit Modal */}
      <WebhookEndpointModal
        open={isModalOpen}
        onOpenChange={(open) => {
          if (!open) closeModal()
        }}
        form={form}
        editingEndpoint={editingEndpoint}
        connectionTested={connectionTested}
        onTest={handleTest}
        onSubmit={handleSubmit}
        isTesting={loading.test}
        saveStatus={saveStatus}
      />

      {/* Delete confirmation modal */}
      <WebhookEndpointDeleteModal
        open={deleteEndpointId !== null}
        onOpenChange={(open) => {
          if (!open) closeDeleteModal()
        }}
        onConfirm={() => {
          if (deleteEndpointId !== null) {
            void handleDelete(deleteEndpointId)
          }
        }}
        endpointName={endpointToDelete?.name ?? ''}
        isDeleting={
          deleteEndpointId !== null && loading.delete[deleteEndpointId]
        }
      />
    </div>
  )
}
