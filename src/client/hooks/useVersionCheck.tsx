import {
  type UpdateStatusResponse,
  UpdateStatusResponseSchema,
} from '@root/schemas/system/update-status.schema'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { apiClient } from '@/lib/apiClient'
import { useAppQuery } from '@/lib/useAppQuery'

export interface VersionCheckResult {
  updateAvailable: boolean
  latestVersion: string | null
  currentVersion: string
  releaseUrl: string | null
  releaseName: string | null
  releaseBody: string | null
  publishedAt: string | null
  isLoading: boolean
  isError: boolean
}

const VERSION_TOAST_KEY = 'version-toast-notified'
// Server runs the GitHub fetch on a 1-hour cron, so polling more often than
// every 15 minutes is wasted work. We still poll occasionally so a user with
// a long-lived tab eventually sees the new state without a hard reload.
const FIFTEEN_MINUTES = 15 * 60 * 1000

/**
 * Query key factory for version check
 */
export const versionCheckKeys = {
  all: ['version-check'] as const,
  status: () => [...versionCheckKeys.all, 'status'] as const,
}

async function fetchUpdateStatus(): Promise<UpdateStatusResponse> {
  return apiClient.get('/v1/system/update-status', UpdateStatusResponseSchema)
}

/**
 * Hook to check for application updates via the server-side cached
 * `/v1/system/update-status` endpoint.
 *
 * The server polls GitHub hourly and caches the result, so this hook
 * only needs to read that cache. Browsers no longer hit GitHub directly,
 * which avoids per-user rate limiting.
 *
 * Shows a toast notification once per version when an update is detected.
 * Returns version info for use in persistent UI indicators.
 */
export function useVersionCheck(): VersionCheckResult {
  const {
    data: status,
    isLoading,
    isError,
  } = useAppQuery({
    queryKey: versionCheckKeys.status(),
    queryFn: fetchUpdateStatus,
    staleTime: FIFTEEN_MINUTES,
    refetchInterval: FIFTEEN_MINUTES,
    refetchOnWindowFocus: false,
    retry: false,
  })

  const versionInfo = {
    updateAvailable: status?.updateAvailable ?? false,
    latestVersion: status?.latestVersion ?? null,
    currentVersion: status?.currentVersion ?? __APP_VERSION__.replace(/^v/, ''),
    releaseUrl: status?.releaseUrl ?? null,
    releaseName: status?.releaseName ?? null,
    releaseBody: status?.releaseBody ?? null,
    publishedAt: status?.publishedAt ?? null,
  }

  useEffect(() => {
    const notifiedVersion = sessionStorage.getItem(VERSION_TOAST_KEY)
    if (
      versionInfo.updateAvailable &&
      versionInfo.latestVersion &&
      notifiedVersion !== versionInfo.latestVersion
    ) {
      sessionStorage.setItem(VERSION_TOAST_KEY, versionInfo.latestVersion)

      const url = versionInfo.releaseUrl
      const timeoutId = setTimeout(() => {
        toast(
          `A new version (v${versionInfo.latestVersion}) is available. You're running v${versionInfo.currentVersion}.`,
          {
            id: 'version-update-notification',
            duration: 8000,
            action: {
              label: 'View Release',
              onClick: () => {
                if (url) {
                  window.open(url, '_blank', 'noopener,noreferrer')
                }
              },
            },
          },
        )
      }, 3000)

      return () => clearTimeout(timeoutId)
    }
  }, [
    versionInfo.updateAvailable,
    versionInfo.latestVersion,
    versionInfo.currentVersion,
    versionInfo.releaseUrl,
  ])

  return {
    ...versionInfo,
    isLoading,
    isError,
  }
}
