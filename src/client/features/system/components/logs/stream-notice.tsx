import { ErrorAlert } from '@/components/error-alert'
import { Button } from '@/components/ui/button'
import { FAILED_TEXT, retryText } from '@/features/system/lib/logs/log-copy'
import type { StreamStatus } from '@/features/system/lib/logs/stream-status'

export function StreamNotice({
  status,
  onReconnect,
}: {
  status: StreamStatus
  onReconnect: () => void
}) {
  if (status.kind === 'retrying') {
    return (
      <p className="text-sm text-muted-foreground">
        {retryText(status.attempt, status.delayMs)}
      </p>
    )
  }
  if (status.kind !== 'failed') return null
  return (
    <ErrorAlert message={FAILED_TEXT}>
      <Button type="button" variant="neutral" size="sm" onClick={onReconnect}>
        Reconnect
      </Button>
    </ErrorAlert>
  )
}
