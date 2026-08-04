import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

interface PageErrorProps {
  message: string
  title?: string
  onRetry?: () => void
}

export function PageError({ message, title = 'Error', onRetry }: PageErrorProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <Alert variant="error" className="w-fit">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
      {onRetry && (
        <Button type="button" variant="noShadow" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}
