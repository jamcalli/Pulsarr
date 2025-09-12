import { UtilitySectionHeader } from '@/components/ui/utility-section-header'
import { LogViewerSkeleton } from './log-viewer-skeleton'

/**
 * Full page skeleton loader for the log viewer page
 */
export function LogViewerPageSkeleton() {
  return (
    <output
      className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]"
      aria-live="polite"
      aria-busy="true"
    >
      <UtilitySectionHeader
        title="Log Viewer"
        description="Live streaming terminal-style log viewer with DEBUG level support, auto-connect, and pause/resume functionality"
        showStatus={false}
      />

      <div className="mt-6">
        <LogViewerSkeleton />
      </div>
    </output>
  )
}
