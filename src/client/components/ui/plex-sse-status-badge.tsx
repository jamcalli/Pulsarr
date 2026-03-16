import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { usePlexSSEStatus } from '@/hooks/plex/usePlexSSEStatus'
import { cn } from '@/lib/utils'

export function PlexSSEStatusBadge() {
  const status = usePlexSSEStatus()

  const getBadgeVariant = () => {
    switch (status) {
      case 'connected':
        return 'bg-green-500 hover:bg-green-500 text-black'
      case 'disconnected':
        return 'bg-red-500 hover:bg-red-500 text-black'
      default:
        return 'bg-gray-400 hover:bg-gray-400 text-black'
    }
  }

  const badge = (
    <div className="ml-2 inline-flex items-center gap-2 h-full">
      <Badge
        variant="neutral"
        className={cn('px-2 py-0.5 h-7 text-sm', getBadgeVariant())}
      >
        SSE: {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    </div>
  )

  if (status === 'disconnected') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>
          Unable to connect to Plex SSE. Check your server connection in Plex
          Configuration.
        </TooltipContent>
      </Tooltip>
    )
  }

  return badge
}
