import { useTautulliStatus } from '@/hooks/notifications/useTautulliStatus'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * Displays a status badge indicating the current Tautulli service state.
 *
 * The badge color reflects the status: green for "running", red for "disabled", and gray for any other value. The status text is capitalized for display.
 */
export function TautulliStatusBadge() {
  const status = useTautulliStatus()
  
  const getBadgeVariant = () => {
    switch (status) {
      case 'running':
        return 'bg-green-500 hover:bg-green-500 text-black'
      case 'disabled':
        return 'bg-red-500 hover:bg-red-500 text-black'
      default:
        return 'bg-gray-400 hover:bg-gray-400 text-black'
    }
  }
  
  return (
    <div className="ml-2 inline-flex items-center gap-2 h-full">
      <Badge 
        variant="neutral" 
        className={cn('px-2 py-0.5 h-7 text-sm', getBadgeVariant())}
      >
        {status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()}
      </Badge>
    </div>
  )
}