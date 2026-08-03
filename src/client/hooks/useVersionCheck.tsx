import { useEffect } from 'react'
import { toast } from 'sonner'
import { $api } from '@/lib/tanstackApi'
import { useMinLoading } from '@/lib/useMinLoading'

export interface VersionCheckResult {
  updateAvailable: boolean
  latestVersion: string | null
  currentVersion: string
  releaseUrl: string | null
  releaseName: string | null
  releaseBody: string | null
  releaseBodyHtml: string | null
  publishedAt: string | null
  isLoading: boolean
  isError: boolean
}

const VERSION_TOAST_KEY = 'version-toast-notified'
// Server runs the GitHub fetch hourly; polling more often is wasted work.
const FIFTEEN_MINUTES = 15 * 60 * 1000
// Boot refresh runs detached server-side, so the first read can be 'pending'.
// Poll quickly until it resolves, then settle into the normal cadence.
const PENDING_POLL = 5 * 1000

export function useVersionCheck(): VersionCheckResult {
  const {
    data: status,
    isLoading,
    isError,
  } = useMinLoading(
    $api.useQuery(
      'get',
      '/v1/system/update-status',
      {},
      {
        staleTime: FIFTEEN_MINUTES,
        refetchInterval: (query) =>
          query.state.data?.status === 'pending'
            ? PENDING_POLL
            : FIFTEEN_MINUTES,
        refetchOnWindowFocus: false,
        retry: false,
      },
    ),
  )

  const versionInfo = {
    updateAvailable: status?.updateAvailable ?? false,
    latestVersion: status?.latestVersion ?? null,
    currentVersion: status?.currentVersion ?? __APP_VERSION__.replace(/^v/, ''),
    releaseUrl: status?.releaseUrl ?? null,
    releaseName: status?.releaseName ?? null,
    releaseBody: status?.releaseBody ?? null,
    releaseBodyHtml: status?.releaseBodyHtml ?? null,
    publishedAt: status?.publishedAt ?? null,
  }

  useEffect(() => {
    const notifiedVersion = sessionStorage.getItem(VERSION_TOAST_KEY)
    if (
      versionInfo.updateAvailable &&
      versionInfo.latestVersion &&
      notifiedVersion !== versionInfo.latestVersion
    ) {
      const url = versionInfo.releaseUrl
      const latestVersion = versionInfo.latestVersion
      const timeoutId = setTimeout(() => {
        sessionStorage.setItem(VERSION_TOAST_KEY, latestVersion)
        toast(
          `A new version (v${latestVersion}) is available. You're running v${versionInfo.currentVersion}.`,
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
