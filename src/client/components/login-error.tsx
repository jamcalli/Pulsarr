import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface LoginErrorMessageProps {
  message: string
}

export function LoginErrorMessage({ message }: LoginErrorMessageProps) {
  return (
    <Alert variant="error">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}
