import { useEffect, useRef } from 'react'
import semver from 'semver'
import { toast } from 'sonner'
import { useAppQuery } from '@/lib/useAppQuery'

interface GitHubRelease {
  tag_name: string
  html_url: string
}

interface VersionCheckResult {
  updateAvailable: boolean
  latestVersion: string | null
  currentVersion: string
  releaseUrl: string | null
  isLoading: boolean
  isError: boolean
}

const VERSION_TOAST_KEY = 'version-toast-shown'
const THIRTY_MINUTES = 30 * 60 * 1000

/**
 * Query key factory for version check
 */
export const versionCheckKeys = {
  all: ['version-check'] as const,
  latest: (owner: string, repo: string) =>
    [...versionCheckKeys.all, owner, repo] as const,
}

/**
 * Fetches the latest release from GitHub API
 */
async function fetchLatestRelease(
  repoOwner: string,
  repoName: string,
): Promise<GitHubRelease> {
  const response = await fetch(
    `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`,
  )

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`)
  }

  return response.json()
}

/**
 * Compares versions and returns update availability info
 */
function checkVersionUpdate(release: GitHubRelease | undefined): {
  updateAvailable: boolean
  latestVersion: string | null
  currentVersion: string
  releaseUrl: string | null
} {
  const currentVersion =
    semver.clean(__APP_VERSION__) ?? __APP_VERSION__.replace(/^v/, '')

  if (!release) {
    return {
      updateAvailable: false,
      latestVersion: null,
      currentVersion,
      releaseUrl: null,
    }
  }

  const latestVersion =
    semver.clean(release.tag_name) ?? release.tag_name.replace(/^v/, '')

  const updateAvailable =
    semver.valid(latestVersion) &&
    semver.valid(currentVersion) &&
    semver.gt(latestVersion, currentVersion)

  return {
    updateAvailable: !!updateAvailable,
    latestVersion,
    currentVersion,
    releaseUrl: release.html_url,
  }
}

/**
 * Hook to check for application updates via GitHub releases.
 *
 * Uses React Query for:
 * - Automatic deduplication across component mounts
 * - 30-minute stale time (won't re-fetch on navigation)
 * - 30-minute refetch interval (periodic checks for long sessions)
 *
 * Shows a toast notification once per session when update is detected.
 * Returns version info for use in persistent UI indicators.
 *
 * @param repoOwner - GitHub repository owner
 * @param repoName - GitHub repository name
 * @returns Version check result with update availability and version info
 */
export function useVersionCheck(
  repoOwner: string,
  repoName: string,
): VersionCheckResult {
  const toastShownRef = useRef(false)

  const { data: release, isLoading, isError } = useAppQuery({
    queryKey: versionCheckKeys.latest(repoOwner, repoName),
    queryFn: () => fetchLatestRelease(repoOwner, repoName),
    staleTime: THIRTY_MINUTES,
    refetchInterval: THIRTY_MINUTES,
    refetchOnWindowFocus: false,
    retry: false,
  })

  const versionInfo = checkVersionUpdate(release)

  // Show toast once per session when update is detected (with 3s delay for UI to settle)
  useEffect(() => {
    if (
      versionInfo.updateAvailable &&
      versionInfo.latestVersion &&
      !toastShownRef.current &&
      !sessionStorage.getItem(VERSION_TOAST_KEY)
    ) {
      toastShownRef.current = true
      sessionStorage.setItem(VERSION_TOAST_KEY, 'true')

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
  }, [versionInfo.updateAvailable, versionInfo.latestVersion, versionInfo.currentVersion, versionInfo.releaseUrl])

  return {
    ...versionInfo,
    isLoading,
    isError,
  }
}
