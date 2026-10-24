import { Button } from '@/components/ui/button'
import type { LogsPage } from '@/features/system/hooks/logs/useLogsPage'
import {
  downloadText,
  logExportFileName,
  logLinesText,
} from '@/features/system/lib/logs/log-text'
import { COPIED_LABEL, useCopyFeedback } from '@/hooks/useCopyFeedback'

export function LogStreamActions({ page }: { page: LogsPage }) {
  const { stream, shownEntries } = page
  const { copied, copy } = useCopyFeedback()
  const noneShown = shownEntries.length === 0

  return (
    <>
      {stream.status.kind === 'paused' ? (
        <Button type="button" size="sm" onClick={stream.resume}>
          Resume
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={stream.status.kind !== 'live'}
          onClick={stream.pause}
        >
          Pause
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={noneShown}
        onClick={() => copy(logLinesText(shownEntries))}
      >
        {copied ? COPIED_LABEL : 'Copy'}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={noneShown}
        onClick={() =>
          downloadText(
            logExportFileName(new Date()),
            logLinesText(shownEntries),
          )
        }
      >
        Export
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page.total === 0}
        onClick={page.clear}
      >
        Clear
      </Button>
    </>
  )
}
