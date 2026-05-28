import type React from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { useVersionCheck } from '@/hooks/useVersionCheck'

interface VersionDisplayProps {
  className?: string
  style?: React.CSSProperties
}

export function VersionDisplay({ className = '', style }: VersionDisplayProps) {
  const {
    updateAvailable,
    latestVersion,
    releaseUrl,
    releaseName,
    releaseBodyHtml,
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
        <PopoverContent
          align="end"
          className="w-[clamp(20rem,40vw,32rem)] max-w-[90vw]"
        >
          <div className="space-y-3">
            <div>
              <div className="text-sm font-bold text-main-foreground">
                {releaseName ?? `v${latestVersion}`} available
              </div>
              <div className="text-xs text-main-foreground/80">
                You&apos;re running v{__APP_VERSION__}
                {publishedLabel ? ` · Released ${publishedLabel}` : ''}
              </div>
            </div>
            {releaseBodyHtml ? (
              <div
                className="max-h-[clamp(12rem,45vh,30rem)] overflow-y-auto rounded-base border-2 border-border bg-secondary-background px-3 py-2 text-xs text-foreground [&_a]:text-foreground [&_a]:underline [&_code]:rounded-xs [&_code]:bg-slate-200 [&_code]:px-1 [&_code]:font-mono [&_code]:dark:bg-slate-800 [&_h1]:my-1 [&_h1]:text-sm [&_h1]:font-bold [&_h2]:my-1 [&_h2]:text-sm [&_h2]:font-bold [&_h3]:my-1 [&_h3]:text-xs [&_h3]:font-bold [&_li]:ml-4 [&_li]:list-disc [&_p]:my-1 [&_pre]:overflow-x-auto [&_pre]:rounded-xs [&_pre]:bg-slate-100 [&_pre]:p-2 [&_pre]:font-mono [&_pre]:dark:bg-slate-800 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:my-1"
                // HTML comes from GitHub /markdown applied to first-party release notes
                dangerouslySetInnerHTML={{ __html: releaseBodyHtml }}
              />
            ) : null}
            <a
              href={releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm font-bold text-main-foreground underline hover:no-underline"
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
