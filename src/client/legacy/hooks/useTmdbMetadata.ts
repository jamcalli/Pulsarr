import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

type TmdbMetadataResponse = components['schemas']['TmdbMetadataResponse']

export interface TmdbLookupTarget {
  id: number
  contentType: components['schemas']['ContentType']
  contentGuids: string[]
}

interface UseTmdbMetadataOptions {
  region?: string
}

interface UseTmdbMetadataReturn {
  data: TmdbMetadataResponse | null
  loading: boolean
  error: string | null
  fetchMetadata: (
    target: TmdbLookupTarget,
    regionOnly?: boolean,
  ) => Promise<void>
  clearData: () => void
}

export function useTmdbMetadata(
  options: UseTmdbMetadataOptions = {},
): UseTmdbMetadataReturn {
  const [data, setData] = useState<TmdbMetadataResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestSeqRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      requestSeqRef.current++
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [])

  const clearData = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    requestSeqRef.current++
    setData(null)
    setError(null)
    setLoading(false)
  }, [])

  const fetchMetadata = useCallback(
    async (target: TmdbLookupTarget, regionOnly = false) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      const seq = ++requestSeqRef.current
      const abortController = new AbortController()
      abortControllerRef.current = abortController

      setLoading(true)
      setError(null)
      if (!regionOnly) {
        setData(null)
      }

      try {
        const normalizedGuids = target.contentGuids.map((g) =>
          g.trim().toLowerCase(),
        )
        const tmdbGuid = normalizedGuids.find((g) => /^tmdb:\d+$/.test(g))
        const tvdbGuid = normalizedGuids.find((g) => /^tvdb:\d+$/.test(g))

        // TVDB first for shows, since TMDB show ids collide with movie ids
        const guidToUse =
          target.contentType === 'show'
            ? tvdbGuid || tmdbGuid
            : tmdbGuid || tvdbGuid

        if (!guidToUse) {
          throw new Error(
            'No valid TMDB or TVDB GUID found for this content. Expected formats: tmdb:123 or tvdb:456 (case-insensitive).',
          )
        }

        const region = options.region
          ? options.region.length === 2
            ? options.region.toUpperCase()
            : options.region
          : undefined

        const {
          data: metadataData,
          error: fetchError,
          response: metadataResponse,
        } = await apiFetch.GET('/v1/tmdb/metadata/{id}', {
          params: {
            path: { id: guidToUse },
            query: { region, type: target.contentType },
          },
          signal: abortController.signal,
          cache: regionOnly ? 'no-store' : 'default',
        })

        if (fetchError) {
          if (metadataResponse.status === 404) {
            throw new Error(
              'No TMDB metadata available for this content. The content may only have TVDB information or may not be in the database.',
            )
          }
          throw new Error('Failed to fetch TMDB metadata for this request')
        }
        if (requestSeqRef.current !== seq) return

        if (regionOnly) {
          setData((prev) => {
            if (!prev) return metadataData
            const hasWatchProviders = Object.hasOwn(
              metadataData.metadata,
              'watchProviders',
            )
            return {
              ...prev,
              metadata: {
                ...prev.metadata,
                watchProviders: hasWatchProviders
                  ? metadataData.metadata.watchProviders
                  : prev.metadata.watchProviders,
              },
            }
          })
        } else {
          setData(metadataData)
        }
      } catch (err) {
        if (requestSeqRef.current !== seq) return

        // undici reports an aborted fetch as a code instead of a DOMException name
        const aborted =
          (err instanceof DOMException && err.name === 'AbortError') ||
          (err instanceof Error &&
            'code' in err &&
            err.code === 'ERR_ABORTED')
        if (aborted) {
          return
        }

        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error occurred'
        setError(errorMessage)
        if (!regionOnly) {
          setData(null)
        }
      } finally {
        if (requestSeqRef.current === seq) {
          setLoading(false)
          if (abortControllerRef.current === abortController) {
            abortControllerRef.current = null
          }
        }
      }
    },
    [options.region],
  )

  return {
    data,
    loading,
    error,
    fetchMetadata,
    clearData,
  }
}
