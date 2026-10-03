import { cn } from 'cn'
import { useMemo } from 'react'
import { sanitizeReleaseNotes } from '@/lib/release-notes'

export function ReleaseNotes({
  html,
  className,
}: {
  html: string
  className?: string
}) {
  const safeHtml = useMemo(() => sanitizeReleaseNotes(html), [html])

  return (
    <section
      aria-label="Release notes"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region needs focus so keyboard users can scroll it
      tabIndex={0}
      className={cn(
        'prose prose-sm prose-tokens max-w-none prose-headings:mt-4 prose-headings:mb-2 prose-headings:text-sm prose-headings:font-bold overflow-y-auto rounded-md border border-divider bg-inset px-3 py-2.5 outline-foreground/50 focus-visible:outline-3 focus-visible:outline-offset-0',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  )
}
