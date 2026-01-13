import { ExternalLink, Webhook } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WebhookEndpointCard } from '@/features/notifications/components/webhooks/webhook-endpoint-card'
import { WebhookEndpointCardSkeleton } from '@/features/notifications/components/webhooks/webhook-endpoint-card-skeleton'
import { WebhookEndpointDeleteModal } from '@/features/notifications/components/webhooks/webhook-endpoint-delete-modal'
import { WebhookEndpointModal } from '@/features/notifications/components/webhooks/webhook-endpoint-modal'
import { useWebhookEndpoints } from '@/features/notifications/hooks/useWebhookEndpoints'
import { api } from '@/lib/api'

function WebhookEndpointsSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2].map((i) => (
        <WebhookEndpointCardSkeleton key={i} />
      ))}
    </div>
  )
}

export function WebhookEndpointsSection() {
  const {
    endpoints,
    isLoading,
    createMutation,
    updateMutation,
    deleteMutation,
    testMutation,
    testExistingMutation,
    form,
    connectionTested,
    testedEndpoints,
    editingEndpoint,
    isModalOpen,
    deleteEndpointId,
    openCreateModal,
    openEditModal,
    closeModal,
    handleTest,
    handleTestExisting,
    handleSubmit,
    handleDelete,
    openDeleteModal,
    closeDeleteModal,
  } = useWebhookEndpoints()

  const endpointToDelete = endpoints.find((ep) => ep.id === deleteEndpointId)
  const hasEndpoints = endpoints.length > 0

  // Derive save status from mutations (follows approvals pattern)
  const isSaving = createMutation.isPending || updateMutation.isPending
  const saveSuccess = createMutation.isSuccess || updateMutation.isSuccess
  const saveStatus: 'idle' | 'loading' | 'success' = isSaving
    ? 'loading'
    : saveSuccess
      ? 'success'
      : 'idle'

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="text-sm text-foreground p-3 bg-secondary-background rounded-base border-2 border-border">
        <p>
          Configure webhook endpoints to receive notifications for Pulsarr
          events. Webhooks send JSON payloads to your specified URLs when events
          occur.{' '}
          <a
            href={api('/api/docs#tag/webhook-payloads')}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-500 inline-flex items-center gap-1"
          >
            Click here <ExternalLink className="h-3 w-3" />
          </a>{' '}
          for payload schemas.
        </p>
      </div>

      {/* Content */}
      {isLoading ? (
        <WebhookEndpointsSkeleton />
      ) : hasEndpoints ? (
        <>
          {/* Button at top when endpoints exist */}
          <Button
            onClick={openCreateModal}
            variant="blue"
            className="flex items-center gap-2"
          >
            <Webhook className="h-4 w-4" />
            Add Webhook Endpoint
          </Button>

          {/* Endpoint cards */}
          <div className="space-y-3">
            {endpoints.map((endpoint) => (
              <WebhookEndpointCard
                key={endpoint.id}
                endpoint={endpoint}
                onEdit={() => openEditModal(endpoint)}
                onDelete={() => openDeleteModal(endpoint.id)}
                onTest={() => handleTestExisting(endpoint.id)}
                isDeleting={
                  deleteMutation.isPending && deleteEndpointId === endpoint.id
                }
                isTesting={
                  testExistingMutation.isPending &&
                  testExistingMutation.variables === endpoint.id
                }
                connectionTested={testedEndpoints[endpoint.id]}
              />
            ))}
          </div>
        </>
      ) : (
        /* Empty state - centered button */
        <div className="text-center py-8 text-foreground">
          <p>No webhook endpoints configured</p>
          <Button
            onClick={openCreateModal}
            variant="blue"
            className="mt-4 flex items-center gap-2 mx-auto"
          >
            <Webhook className="h-4 w-4" />
            Add Webhook Endpoint
          </Button>
        </div>
      )}

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
        isTesting={testMutation.isPending}
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
        isDeleting={deleteMutation.isPending}
      />
    </div>
  )
}
