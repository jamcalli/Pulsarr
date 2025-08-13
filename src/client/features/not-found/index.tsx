import { AlertCircle, Home } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

/**
 * Displays a styled error alert indicating that the requested page was not found.
 *
 * Provides a message explaining the missing page and a link to return to the dashboard.
 */
export function NotFoundPage() {
  return (
    <div className="w-full max-w-md px-4">
      <Alert variant="error" className="text-black">
        <AlertCircle className="h-4 w-4 text-black" />
        <AlertTitle className="text-black">Oooff!</AlertTitle>
        <AlertDescription className="space-y-4 text-black">
          <p>
            Nothing to see here. The page you're looking for doesn't exist or
            has been moved.
          </p>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 underline hover:no-underline font-medium"
          >
            <Home className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </AlertDescription>
      </Alert>
    </div>
  )
}

export default NotFoundPage
