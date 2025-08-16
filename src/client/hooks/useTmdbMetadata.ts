import type { ApprovalRequestResponse } from '@root/schemas/approval/approval.schema'
import type { TmdbMetadataSuccessResponse } from '@root/schemas/tmdb/tmdb.schema'
import { useState } from 'react'

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

  const clearData = () => {
    setData(null)
    setError(null)
    setLoading(false)
  }

  const fetchMetadata = async (approvalRequest: ApprovalRequestResponse, regionOnly = false) => {
    setLoading(true)
    setError(null)
    if (!regionOnly) {
      setData(null) // Only clear previous data for full fetch
    }

    try {
      // Find a TMDB or TVDB GUID from the approval request's content GUIDs
      const tmdbGuid = approvalRequest.contentGuids.find(guid => guid.startsWith('tmdb:'))
      const tvdbGuid = approvalRequest.contentGuids.find(guid => guid.startsWith('tvdb:'))
      
      const guidToUse = tmdbGuid || tvdbGuid
      
      if (!guidToUse) {
        throw new Error(
          'No TMDB or TVDB GUID found in approval request. Cannot fetch metadata.',
        )
      }

      // Use the new intelligent TMDB endpoint that accepts GUID format
      const metadataResponse = await fetch(
        `/v1/tmdb/metadata/${encodeURIComponent(guidToUse)}${
          options.region ? `?region=${options.region}` : ''
        }`,
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
      
      if (regionOnly && data) {
        // Only update watch providers for region changes
        setData({
          ...data,
          metadata: {
            ...data.metadata,
            watchProviders: metadataData.metadata.watchProviders
          }
        })
      } else {
        setData(metadataData)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
      setError(errorMessage)
      if (!regionOnly) {
        setData(null)
      }
    } finally {
      setLoading(false)
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