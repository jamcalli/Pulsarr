import type { ApprovalRequestResponse } from '@root/schemas/approval/approval.schema'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { TmdbMetadataDisplay } from '@/components/tmdb-metadata-display'
import { useTmdbMetadata } from '@/hooks/useTmdbMetadata'
import { useConfigStore } from '@/stores/configStore'

interface TmdbContentViewerProps {
  approvalRequest: ApprovalRequestResponse
}

/**
 * Reusable TMDB content viewer that automatically fetches and displays TMDB metadata.
 *
 * Used in both approval modals and dashboard content detail modals to provide
 * consistent TMDB information display across the application.
 */
export function TmdbContentViewer({ approvalRequest }: TmdbContentViewerProps) {
  const { config } = useConfigStore()

  const tmdbMetadata = useTmdbMetadata({
    region: config?.tmdbRegion,
  })

  // Auto-fetch metadata: full fetch on mount/item change; region-only refresh on region changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: Intentional deps
  useEffect(() => {
    if (!tmdbMetadata.data) {
      tmdbMetadata.fetchMetadata(approvalRequest)
    } else if (config?.tmdbRegion) {
      tmdbMetadata.fetchMetadata(approvalRequest, true)
    }
  }, [approvalRequest.id, config?.tmdbRegion])

  if (tmdbMetadata.error) {
    return (
      <div
        role="alert"
        className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4"
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-red-800 dark:text-red-200 mb-1">
              Unable to Load Details
            </h4>
            <p className="text-sm text-red-700 dark:text-red-300">
              {tmdbMetadata.error}
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (tmdbMetadata.data) {
    return <TmdbMetadataDisplay data={tmdbMetadata.data} />
  }

  // Loading state
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Loading media details...</span>
      </div>
    </div>
  )
}
