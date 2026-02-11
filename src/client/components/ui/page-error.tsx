import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface PageErrorProps {
  message: string
  title?: string
}

export function PageError({ message, title = 'Error' }: PageErrorProps) {
  return (
    <div className="flex justify-center py-8">
      <Alert variant="error" className="w-fit">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    </div>
  )
}
