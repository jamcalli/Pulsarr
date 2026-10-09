import { CircleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export function ErrorAlert({
  message,
  detail = null,
}: {
  message: string | null
  detail?: string | null
}) {
  if (!message) return null
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>{message}</AlertTitle>
      {detail && <AlertDescription>{detail}</AlertDescription>}
    </Alert>
  )
}
