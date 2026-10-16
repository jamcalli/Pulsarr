import { useRef } from 'react'
import { CardHeaderWithActions } from '@/components/card-header-with-actions'
import { CardTitleCount } from '@/components/card-title-count'
import { Card, CardContent, CardDescription } from '@/components/ui/card'
import { LogFilters } from '@/features/system/components/logs/log-filters'
import { LogStream } from '@/features/system/components/logs/log-stream'
import { LogStreamActions } from '@/features/system/components/logs/log-stream-actions'
import { StreamNotice } from '@/features/system/components/logs/stream-notice'
import type { LogsPage } from '@/features/system/hooks/logs/useLogsPage'
import { useStreamHeight } from '@/features/system/hooks/logs/useStreamHeight'
import { capNote } from '@/features/system/lib/logs/log-copy'

interface LogStreamCardProps {
  page: LogsPage
  silent: boolean
}

export function LogStreamCard({ page, silent }: LogStreamCardProps) {
  const card = useRef<HTMLDivElement>(null)
  useStreamHeight(card)
  const note = capNote(page.total)

  return (
    <Card ref={card}>
      <CardHeaderWithActions actions={<LogStreamActions page={page} />}>
        <CardTitleCount title="Log lines" count={page.total} />
        {note && <CardDescription>{note}</CardDescription>}
      </CardHeaderWithActions>
      <CardContent className="gap-4">
        <StreamNotice
          status={page.stream.status}
          onReconnect={page.stream.resume}
        />
        <LogFilters page={page} />
        <LogStream page={page} silent={silent} />
      </CardContent>
    </Card>
  )
}
