import { AlertCircle, Loader2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { TmdbMetadataDisplay } from '@/components/tmdb-metadata-display'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useConfig } from '@/hooks/useConfig'
import { type TmdbLookupTarget, useTmdbMetadata } from '@/hooks/useTmdbMetadata'

interface TmdbContentViewerProps {
  target: TmdbLookupTarget
}

export function TmdbContentViewer({ target }: TmdbContentViewerProps) {
  const { config } = useConfig()

  const tmdbMetadata = useTmdbMetadata({
    region: config?.tmdbRegion,
  })

  const lastIdRef = useRef(target.id)
  useEffect(() => {
    const idChanged = lastIdRef.current !== target.id
    if (idChanged || !tmdbMetadata.data) {
      lastIdRef.current = target.id
      tmdbMetadata.fetchMetadata(target)
      return
    }
    if (config?.tmdbRegion) {
      tmdbMetadata.fetchMetadata(target, true)
    }
  }, [target.id, config?.tmdbRegion])

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
