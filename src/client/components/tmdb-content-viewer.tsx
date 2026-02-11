import type { ApprovalRequestResponse } from '@root/schemas/approval/approval.schema'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { TmdbMetadataDisplay } from '@/components/tmdb-metadata-display'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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

  // Auto-fetch metadata:
  // - Full fetch on mount or when the selected item changes
  // - Region-only refresh when the region changes for the same item
  const lastIdRef = useRef(approvalRequest.id)
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate deps
  useEffect(() => {
    const idChanged = lastIdRef.current !== approvalRequest.id
    if (idChanged || !tmdbMetadata.data) {
      lastIdRef.current = approvalRequest.id
      tmdbMetadata.fetchMetadata(approvalRequest)
      return
    }
    // Same item, region changed -> refresh providers only
    if (config?.tmdbRegion) {
      tmdbMetadata.fetchMetadata(approvalRequest, true)
    }
  }, [approvalRequest.id, config?.tmdbRegion])

  if (tmdbMetadata.error) {
    return (
      <Alert variant="error">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Unable to Load Details</AlertTitle>
        <AlertDescription>{tmdbMetadata.error}</AlertDescription>
      </Alert>
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
