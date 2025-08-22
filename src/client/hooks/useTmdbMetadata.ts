import type { ApprovalRequestResponse } from '@root/schemas/approval/approval.schema'
import type { TmdbMetadataSuccessResponse } from '@root/schemas/tmdb/tmdb.schema'
import { useEffect, useRef, useState } from 'react'

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
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      // Invalidate any in-flight request and abort on unmount
      requestSeqRef.current++
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [])

  const clearData = () => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    // Invalidate any pending handlers tied to the previous seq
    requestSeqRef.current++
    setData(null)
    setError(null)
    setLoading(false)
  }

  const fetchMetadata = async (approvalRequest: ApprovalRequestResponse, regionOnly = false) => {
    // Cancel any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    const seq = ++requestSeqRef.current
    const abortController = new AbortController()
    abortControllerRef.current = abortController
    
    setLoading(true)
    setError(null)
    if (!regionOnly) {
      setData(null) // Only clear previous data for full fetch
    }

    try {
      // Find a TMDB or TVDB GUID from the approval request's content GUIDs
      const tmdbGuid = approvalRequest.contentGuids
        .map((g) => g.trim().toLowerCase())
        .find((g) => g.startsWith('tmdb:') && /^tmdb:\d+$/.test(g))
      const tvdbGuid = approvalRequest.contentGuids
        .map((g) => g.trim().toLowerCase())
        .find((g) => g.startsWith('tvdb:') && /^tvdb:\d+$/.test(g))
      
      // For TV shows, prioritize TVDB to avoid TMDB ID conflicts with movies
      const guidToUse = approvalRequest.contentType === 'show'
        ? (tvdbGuid || tmdbGuid)
        : (tmdbGuid || tvdbGuid)
      
      if (!guidToUse) {
        throw new Error(
          'No valid TMDB or TVDB GUID found in approval request. Expected formats: tmdb:123 or tvdb:456 (case-insensitive).',
        )
      }

      // Use the new intelligent TMDB endpoint that accepts GUID format
      const queryParams = new URLSearchParams()
      if (options.region) {
        queryParams.set('region', options.region.length === 2 ? options.region.toUpperCase() : options.region)
      }
      // Pass content type to help API choose correct endpoint for TMDB IDs
      if (approvalRequest.contentType === 'movie' || approvalRequest.contentType === 'show') {
        queryParams.set('type', approvalRequest.contentType)
      }
      
      const queryString = queryParams.toString()
      const metadataResponse = await fetch(
        `/v1/tmdb/metadata/${encodeURIComponent(guidToUse)}${queryString ? `?${queryString}` : ''}`,
        {
          signal: abortController.signal,
          cache: regionOnly ? 'no-store' : 'default',
          headers: { Accept: 'application/json' }
        }
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
                  watchProviders:
                    metadataData?.metadata?.watchProviders ?? prev.metadata.watchProviders,
                },
              }
            : metadataData,
        )
      } else {
        setData(metadataData)
      }
    } catch (err) {
      if (requestSeqRef.current !== seq) return
      
      // Don't show error for cancelled requests
      const name = (err as any)?.name
      const code = (err as any)?.code
      // Covers browser (DOMException: AbortError) and Node/undici variants
      if (name === 'AbortError' || code === 'ERR_ABORTED') {
        return
      }
      
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
      setError(errorMessage)
      if (!regionOnly) {
        setData(null)
      }
    } finally {
      if (requestSeqRef.current === seq) {
        setLoading(false)
        // Clear the abort controller for this request
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null
        }
      }
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