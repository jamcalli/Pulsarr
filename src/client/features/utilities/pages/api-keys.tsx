import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { UtilitySectionHeader } from '@/components/ui/utility-section-header'
import { ApiKeysDeleteConfirmationModal } from '@/features/utilities/components/api-keys/api-keys-delete-confirmation-modal'
import { ApiKeysForm } from '@/features/utilities/components/api-keys/api-keys-form'
import { ApiKeysSkeleton } from '@/features/utilities/components/api-keys/api-keys-skeleton'
import { useApiKeys } from '@/features/utilities/hooks/useApiKeys'
import { useInitializeWithMinDuration } from '@/hooks/useInitializeWithMinDuration'
import { useConfigStore } from '@/stores/configStore'

const getUserFriendlyErrorMessage = (error: string) => {
  if (error.includes('network') || error.includes('fetch')) {
    return 'Unable to connect to the server. Please check your connection and try again.'
  }
  if (error.includes('unauthorized') || error.includes('403')) {
    return 'You do not have permission to manage API keys.'
  }
  return error // Fallback to technical message
}

/**
 * Renders the administrator interface for managing API keys, including creation, viewing, refreshing, and revocation.
 *
 * Provides secure controls for key visibility, copy functionality, and confirmation dialogs for revoking keys. Handles loading, error, and refreshing states to ensure a responsive and consistent user experience.
 *
 * @returns The API keys management page as a React element.
 */
export function ApiKeysPage() {
  const { isInitialized, initialize } = useConfigStore()

  const {
    form,
    apiKeys,
    isLoading,
    isCreating,
    isRevoking,
    isRefreshing,
    error,
    visibleKeys,
    showDeleteConfirmation,
    setShowDeleteConfirmation,
    onSubmit,
    revokeApiKey,
    toggleKeyVisibility,
    initiateRevoke,
    fetchApiKeys,
  } = useApiKeys()

  // Initialize config store with minimum duration for consistent UX
  const isInitializing = useInitializeWithMinDuration(initialize)

  const totalKeysCount = apiKeys.length

  if (isInitializing || !isInitialized || isLoading) {
    return <ApiKeysSkeleton />
  }

  const selectedApiKey = apiKeys.find(
    (key) => key.id === showDeleteConfirmation,
  )

  return (
    <>
      <ApiKeysDeleteConfirmationModal
        open={showDeleteConfirmation !== null}
        onOpenChange={(open) => !open && setShowDeleteConfirmation(null)}
        onConfirm={() =>
          showDeleteConfirmation && revokeApiKey(showDeleteConfirmation)
        }
        isSubmitting={
          showDeleteConfirmation
            ? isRevoking[showDeleteConfirmation] || false
            : false
        }
        apiKeyName={selectedApiKey?.name || ''}
      />

      <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
        <UtilitySectionHeader
          title="API Keys"
          description="Manage API keys for external access to your Pulsarr instance"
          showStatus={false}
        />

        <div className="mt-6 space-y-6">
          {/* Actions section */}
          <div>
            <h3 className="font-medium text-foreground mb-2">Actions</h3>
            <div className="flex flex-wrap items-center gap-4">
              <Button
                type="button"
                size="sm"
                onClick={() => fetchApiKeys(true)}
                disabled={isLoading || isRefreshing}
                variant="noShadow"
                className="h-8"
              >
                {isRefreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="ml-2">
                  {isRefreshing ? 'Refreshing...' : 'Refresh'}
                </span>
              </Button>
            </div>
          </div>

          <Separator />

          {/* Current Status section */}
          {apiKeys.length > 0 && (
            <>
              <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md">
                <h3 className="font-medium text-foreground mb-2">
                  API Keys Status
                </h3>
                <p className="text-sm text-foreground mb-3">
                  API keys created and configured for external access:
                </p>
                <p className="text-sm text-foreground">
                  {totalKeysCount === 1
                    ? '1 API key'
                    : `${totalKeysCount} API keys`}{' '}
                  created
                </p>
              </div>
              <Separator />
            </>
          )}

          {error && (
            <>
              <div className="p-4 border border-red-500 bg-red-50 dark:bg-red-900/20 rounded-md flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-red-800 dark:text-red-300">
                    Error
                  </h4>
                  <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                    {getUserFriendlyErrorMessage(error)}
                  </p>
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Configuration form */}
          <ApiKeysForm
            form={form}
            apiKeys={apiKeys}
            isCreating={isCreating}
            isRevoking={isRevoking}
            visibleKeys={visibleKeys}
            onSubmit={onSubmit}
            onToggleVisibility={toggleKeyVisibility}
            onInitiateRevoke={initiateRevoke}
          />
        </div>
      </div>
    </>
  )
}

export default ApiKeysPage
