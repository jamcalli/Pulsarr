import { CircleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export function ErrorAlert({
  message,
  detail = null,
  children,
}: {
  message: string | null
  detail?: string | null
  children?: ReactNode
}) {
  if (!message) return null
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>{message}</AlertTitle>
      {(detail || children) && (
        <AlertDescription className="flex flex-col items-start gap-2">
          {detail && <span>{detail}</span>}
          {children}
        </AlertDescription>
      )}
    </Alert>
  )
}
