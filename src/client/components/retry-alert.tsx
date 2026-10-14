import { ErrorAlert } from '@/components/error-alert'
import { Button } from '@/components/ui/button'

export function RetryAlert({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <>
      <ErrorAlert message={message} />
      <Button
        type="button"
        variant="neutral"
        size="sm"
        className="self-start"
        onClick={onRetry}
      >
        Retry
      </Button>
    </>
  )
}
