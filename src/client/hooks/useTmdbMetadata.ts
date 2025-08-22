import type { ApprovalRequestResponse } from '@root/schemas/approval/approval.schema'
import type { TmdbMetadataSuccessResponse } from '@root/schemas/tmdb/tmdb.schema'
import { useRef, useState } from 'react'

interface UseTmdbMetadataOptions {
  region?: string
}

interface UseTmdbMetadataReturn {
  data: TmdbMetadataSuccessResponse | null
  loading: boolean
  error: string | null
  fetchMetadata: (approvalRequest: ApprovalRequestResponse, regionOnly?: boolean) => Promise<void>
  clearData: () => void
}

/**
 * React hook for fetching and managing TMDB metadata related to approval requests.
 *
 * Provides stateful access to TMDB metadata, loading status, and error messages. Exposes functions to fetch metadata for a given approval request (optionally updating only region-specific watch provider data) and to clear all stored metadata and errors.
 *
 * @returns An object containing the current metadata, loading state, error message, and functions to fetch or clear metadata.
 */
export function useTmdbMetadata(
  options: UseTmdbMetadataOptions = {},
): UseTmdbMetadataReturn {
  const [data, setData] = useState<TmdbMetadataSuccessResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestSeqRef = useRef(0)

  const clearData = () => {
    setData(null)
    setError(null)
    setLoading(false)
  }

  const fetchMetadata = async (approvalRequest: ApprovalRequestResponse, regionOnly = false) => {
    const seq = ++requestSeqRef.current
    setLoading(true)
    setError(null)
    if (!regionOnly) {
      setData(null) // Only clear previous data for full fetch
    }

    try {
      // Find a TMDB or TVDB GUID from the approval request's content GUIDs
      const tmdbGuid = approvalRequest.contentGuids.find(guid => guid.toLowerCase().startsWith('tmdb:'))
      const tvdbGuid = approvalRequest.contentGuids.find(guid => guid.toLowerCase().startsWith('tvdb:'))
      
      // For TV shows, prioritize TVDB to avoid TMDB ID conflicts with movies
      const guidToUse = approvalRequest.contentType === 'show'
        ? (tvdbGuid || tmdbGuid)
        : (tmdbGuid || tvdbGuid)
      
      if (!guidToUse) {
        throw new Error(
          'No TMDB or TVDB GUID found in approval request. Cannot fetch metadata.',
        )
      }

      // Use the new intelligent TMDB endpoint that accepts GUID format
      const queryParams = new URLSearchParams()
      if (options.region) {
        queryParams.set('region', options.region)
      }
      // Pass content type to help API choose correct endpoint for TMDB IDs
      if (approvalRequest.contentType) {
        queryParams.set('type', approvalRequest.contentType)
      }
      
      const queryString = queryParams.toString()
      const metadataResponse = await fetch(
        `/v1/tmdb/metadata/${encodeURIComponent(guidToUse)}${queryString ? `?${queryString}` : ''}`,
      )

      if (!metadataResponse.ok) {
        if (metadataResponse.status === 404) {
          throw new Error(
            'No TMDB metadata available for this content. The content may only have TVDB information or may not be in the database.',
          )
        }
        throw new Error('Failed to fetch TMDB metadata for this request')
      }

      const metadataData = await metadataResponse.json()
      if (requestSeqRef.current !== seq) return
      
      if (regionOnly) {
        // Only update watch providers for region changes
        setData((prev) =>
          prev
            ? {
                ...prev,
                metadata: {
                  ...prev.metadata,
                  watchProviders: metadataData.metadata.watchProviders,
                },
              }
            : metadataData,
        )
      } else {
        setData(metadataData)
      }
    } catch (err) {
      if (requestSeqRef.current !== seq) return
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
      setError(errorMessage)
      if (!regionOnly) {
        setData(null)
      }
    } finally {
      if (requestSeqRef.current === seq) setLoading(false)
    }
  }

  return {
    data,
    loading,
    error,
    fetchMetadata,
    clearData,
  }
}