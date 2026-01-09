import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { buildPosterUrl, type PosterContext } from '@/lib/poster-url'

interface UsePosterUrlOptions {
  /** Normalized poster path from DB (fast path - no API call needed) */
  thumb?: string | null
  /** GUIDs for TMDB lookup fallback when thumb is missing */
  guids?: string[]
  /** Content type for GUID prioritization */
  contentType?: 'movie' | 'show'
  /** Display context determining image size */
  context?: PosterContext
  /** Whether to enable fetching (defaults to true) */
  enabled?: boolean
}

interface UsePosterUrlReturn {
  posterUrl: string | null
  isLoading: boolean
  error: string | null
}

/**
 * Unified hook for poster URLs with optimized sizing.
 *
 * Fast path: If `thumb` is provided, immediately returns a sized URL.
 * Fallback: If no `thumb`, fetches poster path from TMDB via guids.
 *
 * @example
 * ```tsx
 * // With thumb from DB (instant, no API call)
 * const { posterUrl } = usePosterUrl({
 *   thumb: item.thumb,
 *   context: 'card'
 * })
 *
 * // Fallback to TMDB fetch when thumb missing
 * const { posterUrl, isLoading } = usePosterUrl({
 *   thumb: item.thumb,  // null
 *   guids: item.guids,
 *   contentType: 'movie',
 *   context: 'card'
 * })
 * ```
 */
export function usePosterUrl({
  thumb,
  guids = [],
  contentType = 'movie',
  context = 'card',
  enabled = true,
}: UsePosterUrlOptions): UsePosterUrlReturn {
  // Fast path: if thumb exists, build URL immediately
  const builtUrl = useMemo(
    () => (thumb ? buildPosterUrl(thumb, context) : null),
    [thumb, context],
  )

  // State for TMDB fallback fetch
  const [fetchedPath, setFetchedPath] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Determine if we need to fetch
  const needsFetch = enabled && !thumb && guids.length > 0

  useEffect(() => {
    if (!needsFetch) {
      setIsLoading(false)
      setFetchedPath(null)
      return
    }

    // Find a usable GUID
    const normalizedGuids = guids.map((g) => g.trim().toLowerCase())
    const tmdbGuid = normalizedGuids.find((g) => /^tmdb:\d+$/.test(g))
    const tvdbGuid = normalizedGuids.find((g) => /^tvdb:\d+$/.test(g))

    // For TV shows, prioritize TVDB to avoid TMDB ID conflicts
    const guidToUse =
      contentType === 'show' ? tvdbGuid || tmdbGuid : tmdbGuid || tvdbGuid

    if (!guidToUse) {
      return
    }

    // Cancel any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    setIsLoading(true)
    setError(null)

    const fetchPoster = async () => {
      try {
        const queryParams = new URLSearchParams({ type: contentType })
        const response = await fetch(
          api(
            `/v1/tmdb/metadata/${encodeURIComponent(guidToUse)}?${queryParams}`,
          ),
          {
            signal: abortController.signal,
            headers: { Accept: 'application/json' },
          },
        )

        if (!response.ok) {
          throw new Error('Failed to fetch metadata')
        }

        const data = await response.json()
        const posterPath = data?.metadata?.details?.poster_path

        if (posterPath) {
          // Store just the path - buildPosterUrl will add the size
          setFetchedPath(posterPath)
        }
      } catch (err) {
        // Ignore abort errors
        if ((err as Error)?.name === 'AbortError') {
          return
        }
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setIsLoading(false)
      }
    }

    fetchPoster()

    return () => {
      abortController.abort()
    }
  }, [needsFetch, contentType, guids.map])

  // Build final URL from fetched path if needed
  const fetchedUrl = useMemo(
    () => (fetchedPath ? buildPosterUrl(fetchedPath, context) : null),
    [fetchedPath, context],
  )

  return {
    posterUrl: builtUrl || fetchedUrl,
    isLoading,
    error,
  }
}
