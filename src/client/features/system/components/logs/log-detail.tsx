import type { LogEntry, LogValue } from '@root/types/logs.types'
import { Button } from '@/components/ui/button'
import { LogFields } from '@/features/system/components/logs/log-fields'
import { logEntryText } from '@/features/system/lib/logs/log-text'
import { COPIED_LABEL, useCopyFeedback } from '@/hooks/useCopyFeedback'
import { formatLogDateTime } from '@/lib/format'

interface LogDetailProps {
  entry: LogEntry
  data: Record<string, LogValue>
}

export function LogDetail({ entry, data }: LogDetailProps) {
  const { copied, copy } = useCopyFeedback()
  const when = formatLogDateTime(new Date(entry.timestamp))
  const heading = entry.module ? `${when}, ${entry.module}` : when

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{heading}</span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="max-md:h-10"
          onClick={() => copy(logEntryText(entry))}
        >
          {copied ? COPIED_LABEL : 'Copy line'}
        </Button>
      </div>
      <LogFields data={data} />
    </div>
  )
}
