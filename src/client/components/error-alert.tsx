import { CircleAlert } from 'lucide-react'
import { Alert, AlertTitle } from '@/components/ui/alert'

export function ErrorAlert({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <Alert variant="danger">
      <CircleAlert />
      <AlertTitle>{message}</AlertTitle>
    </Alert>
  )
}
