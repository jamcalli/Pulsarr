import type { ReactNode } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export function LatestDryRun({
  line,
  action,
}: {
  line: string
  action?: ReactNode
}) {
  return (
    <Alert role="status">
      <AlertTitle>Latest dry run</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        <span>{line}</span>
        {action}
      </AlertDescription>
    </Alert>
  )
}
