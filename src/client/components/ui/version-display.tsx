import type React from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useVersionCheck } from '@/hooks/useVersionCheck'

interface VersionDisplayProps {
  className?: string
  style?: React.CSSProperties
}

/**
 * Displays the current app version with an update indicator when a newer version is available.
 *
 * When an update is detected, the version text becomes a link to the GitHub release page
 * with a tooltip showing the available version.
 * The update check uses React Query with 30-minute caching and periodic refresh.
 */
export function VersionDisplay({ className = '', style }: VersionDisplayProps) {
  const { updateAvailable, latestVersion, releaseUrl, isLoading, isError } = useVersionCheck(
    'jamcalli',
    'Pulsarr',
  )

  // Show skeleton only while loading; on error, fall back to showing version without update indicator
  if (isLoading && !isError) {
    return (
      <span className={className} style={style}>
        <Skeleton className="h-4 w-20 md:w-36 inline-block" />
      </span>
    )
  }

  if (updateAvailable && latestVersion && releaseUrl) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`hover:underline ${className}`}
            style={style}
          >
            v{__APP_VERSION__}
            <span className="hidden md:inline"> (update available)</span>
            <span className="md:hidden"> (new)</span>
          </a>
        </TooltipTrigger>
        <TooltipContent>
          v{latestVersion} available
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <span className={className} style={style}>
      v{__APP_VERSION__}
    </span>
  )
}
