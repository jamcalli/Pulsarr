import type React from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { useVersionCheck } from '@/hooks/useVersionCheck'

interface VersionDisplayProps {
  className?: string
  style?: React.CSSProperties
}

const RELEASE_NOTES_MAX_CHARS = 1200

/**
 * Trim release notes to a reasonable preview length, breaking on a newline
 * boundary when possible so we don't cut mid-line.
 */
function previewReleaseNotes(body: string): { preview: string; truncated: boolean } {
  if (body.length <= RELEASE_NOTES_MAX_CHARS) {
    return { preview: body, truncated: false }
  }
  const slice = body.slice(0, RELEASE_NOTES_MAX_CHARS)
  const lastNewline = slice.lastIndexOf('\n')
  const cutAt = lastNewline > RELEASE_NOTES_MAX_CHARS / 2 ? lastNewline : RELEASE_NOTES_MAX_CHARS
  return { preview: body.slice(0, cutAt).trimEnd(), truncated: true }
}

/**
 * Displays the current app version with an update indicator when a newer version is available.
 *
 * When an update is detected, the version text becomes a popover trigger that shows the
 * release notes inline, plus a link to the GitHub release page.
 * The update check uses React Query with 30-minute caching and periodic refresh.
 */
export function VersionDisplay({ className = '', style }: VersionDisplayProps) {
  const {
    updateAvailable,
    latestVersion,
    releaseUrl,
    releaseNotes,
    releaseName,
    publishedAt,
    isLoading,
    isError,
  } = useVersionCheck('jamcalli', 'Pulsarr')

  // Show skeleton only while loading; on error, fall back to showing version without update indicator
  if (isLoading && !isError) {
    return (
      <span className={className} style={style}>
        <Skeleton className="h-4 w-20 md:w-36 inline-block" />
      </span>
    )
  }

  if (updateAvailable && latestVersion && releaseUrl) {
    const { preview, truncated } = previewReleaseNotes(releaseNotes ?? '')
    const hasNotes = preview.length > 0
    const heading = releaseName?.trim() || `v${latestVersion}`
    const publishedLabel = publishedAt
      ? new Date(publishedAt).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : null

    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`hover:underline text-left ${className}`}
            style={style}
            aria-label={`Update available: v${latestVersion}. Click to view release notes.`}
          >
            v{__APP_VERSION__}
            <span className="hidden md:inline"> (update available)</span>
            <span className="md:hidden"> (new)</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(28rem,90vw)] max-h-[70vh] overflow-y-auto" align="start">
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <h4 className="font-heading text-sm">{heading}</h4>
            {publishedLabel && (
              <span className="text-xs opacity-70">{publishedLabel}</span>
            )}
          </div>
          {hasNotes ? (
            <pre className="text-xs whitespace-pre-wrap font-base leading-relaxed">
              {preview}
              {truncated ? '\n…' : ''}
            </pre>
          ) : (
            <p className="text-xs opacity-70">
              No release notes were published for this version.
            </p>
          )}
          <div className="mt-3 text-xs">
            <a
              href={releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {truncated || !hasNotes ? 'View full release on GitHub →' : 'View release on GitHub →'}
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
