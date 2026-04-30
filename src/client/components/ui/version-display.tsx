import type React from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { useVersionCheck } from '@/hooks/useVersionCheck'

interface VersionDisplayProps {
  className?: string
  style?: React.CSSProperties
}

const MAX_RELEASE_NOTES_LENGTH = 600

function truncateBody(body: string | null): string | null {
  if (!body) return null
  const trimmed = body.trim()
  if (trimmed.length <= MAX_RELEASE_NOTES_LENGTH) return trimmed
  return `${trimmed.slice(0, MAX_RELEASE_NOTES_LENGTH).trimEnd()}…`
}

/**
 * Displays the current app version with an update indicator when a newer
 * version is available.
 *
 * The update check is served by the server-side cron + cache - the client just
 * reads the cached status. When an update is detected, hovering or focusing
 * the version reveals a popover with the release name and (truncated) release
 * notes plus a "View on GitHub" link.
 */
export function VersionDisplay({ className = '', style }: VersionDisplayProps) {
  const {
    updateAvailable,
    latestVersion,
    releaseUrl,
    releaseName,
    releaseBody,
    publishedAt,
    isLoading,
    isError,
  } = useVersionCheck()

  if (isLoading && !isError) {
    return (
      <span className={className} style={style}>
        <Skeleton className="h-4 w-20 md:w-36 inline-block" />
      </span>
    )
  }

  if (updateAvailable && latestVersion && releaseUrl) {
    const truncatedBody = truncateBody(releaseBody)
    const publishedLabel = publishedAt
      ? new Date(publishedAt).toLocaleDateString()
      : null

    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`hover:underline text-left ${className}`}
            style={style}
          >
            v{__APP_VERSION__}
            <span className="hidden md:inline"> (update available)</span>
            <span className="md:hidden"> (new)</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 max-w-[90vw]">
          <div className="space-y-3">
            <div>
              <div className="text-sm font-bold text-foreground">
                {releaseName ?? `v${latestVersion}`} available
              </div>
              <div className="text-xs text-foreground/70">
                You&apos;re running v{__APP_VERSION__}
                {publishedLabel ? ` · Released ${publishedLabel}` : ''}
              </div>
            </div>
            {truncatedBody ? (
              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-base border-2 border-border bg-background p-2 text-xs font-base text-foreground">
                {truncatedBody}
              </pre>
            ) : null}
            <a
              href={releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm font-bold text-foreground underline hover:no-underline"
            >
              View release on GitHub →
            </a>
          </div>
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <span className={className} style={style}>
      v{__APP_VERSION__}
    </span>
  )
}
